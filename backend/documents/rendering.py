import struct
import zlib
from io import BytesIO

from django.core.files.base import ContentFile


CANONICAL_PAGE_WIDTH = 1040
DEFAULT_PAGE_ASPECT = 842 / 595
DEFAULT_PAGE_HEIGHT = round(CANONICAL_PAGE_WIDTH * DEFAULT_PAGE_ASPECT)

# Render DPI: at 150 dpi a standard A4 page is ~1240 px wide before resize.
RENDER_DPI = 150


def _png_chunk(kind, data):
    return (
        struct.pack('>I', len(data))
        + kind
        + data
        + struct.pack('>I', zlib.crc32(kind + data) & 0xFFFFFFFF)
    )


def simple_blank_png(width=CANONICAL_PAGE_WIDTH, height=DEFAULT_PAGE_HEIGHT):
    width = max(1, int(width or CANONICAL_PAGE_WIDTH))
    height = max(1, int(height or DEFAULT_PAGE_HEIGHT))
    raw_rows = []
    white_pixel = b'\xff\xff\xff'
    for _ in range(height):
        raw_rows.append(b'\x00' + white_pixel * width)
    compressed = zlib.compress(b''.join(raw_rows), 9)
    png = b'\x89PNG\r\n\x1a\n'
    png += _png_chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0))
    png += _png_chunk(b'IDAT', compressed)
    png += _png_chunk(b'IEND', b'')
    return png


def _pdf2image_available():
    try:
        import pdf2image  # noqa: F401
        return True
    except ImportError:
        return False


def _get_pdf_bytes(document):
    """Return the raw PDF bytes for the given document.

    Works with both local FileSystemStorage and S3/MinIO storage.
    Returns None if the file cannot be read.
    """
    if not document.file:
        return None
    # Try reading via the storage backend (works for both local and S3).
    try:
        document.file.open('rb')
        data = document.file.read()
        document.file.close()
        return data
    except Exception:
        pass
    # Fallback: local filesystem path.
    try:
        path = document.file.path
        with open(path, 'rb') as fh:
            return fh.read()
    except Exception:
        return None


def _pil_image_to_png_bytes(img, target_width):
    """Resize a PIL Image to target_width and return PNG bytes + (width, height)."""
    from PIL import Image as PillowImage
    img = img.convert('RGB')
    orig_w, orig_h = img.size
    new_h = max(1, int(orig_h * target_width / orig_w))
    if orig_w != int(target_width):
        img = img.resize((int(target_width), new_h), PillowImage.LANCZOS)
    buf = BytesIO()
    img.save(buf, format='PNG', optimize=True)
    return buf.getvalue(), int(target_width), new_h


def generate_document_page_images(document, target_width=CANONICAL_PAGE_WIDTH):
    """Generate stored PNG page previews using pdf2image + Pillow.

    pdf2image wraps Poppler (pdftoppm) and returns PIL Image objects.
    Works with both local FileSystemStorage and S3/MinIO (via _get_pdf_bytes).
    Falls back to a plain white canvas when pdf2image / Poppler is unavailable.
    """
    from .models import DocumentPage

    page_count = max(1, document.page_count or 1)

    # Render all pages at once when pdf2image is available.
    pil_pages = None
    if _pdf2image_available():
        pdf_bytes = _get_pdf_bytes(document)
        if pdf_bytes:
            try:
                from pdf2image import convert_from_bytes
                pil_pages = convert_from_bytes(
                    pdf_bytes,
                    dpi=RENDER_DPI,
                    fmt='png',
                )
            except Exception:
                pil_pages = None

    rendered = []
    for page_number in range(1, page_count + 1):
        page, _ = DocumentPage.objects.get_or_create(
            document=document,
            page_number=page_number,
            defaults={'width': CANONICAL_PAGE_WIDTH, 'height': DEFAULT_PAGE_HEIGHT},
        )

        png_data = width = height = None

        if pil_pages and (page_number - 1) < len(pil_pages):
            try:
                png_data, width, height = _pil_image_to_png_bytes(
                    pil_pages[page_number - 1], target_width
                )
            except Exception:
                png_data = None

        if not png_data:
            aspect = (page.height or DEFAULT_PAGE_HEIGHT) / max(1, page.width or CANONICAL_PAGE_WIDTH)
            width = int(target_width)
            height = max(1, int(width * aspect))
            png_data = simple_blank_png(width, height)

        page.width = width
        page.height = height
        page.image.save(
            f'document-{document.id}-page-{page_number}.png',
            ContentFile(png_data),
            save=False,
        )
        page.save(update_fields=['width', 'height', 'image'])
        rendered.append(page)

    return rendered


def rasterization_capabilities():
    pdf2image_ok = _pdf2image_available()
    active = 'pdf2image+pillow' if pdf2image_ok else 'blank_canvas'
    return {
        'current_renderer': active,
        'source_accurate_pdf_rasterization': pdf2image_ok,
        'pdf2image_available': pdf2image_ok,
        'fallback_renderer_available': True,
    }
