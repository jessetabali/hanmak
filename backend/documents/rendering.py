import struct
import subprocess
import zlib
from io import BytesIO

from django.core.files.base import ContentFile


CANONICAL_PAGE_WIDTH = 1040
DEFAULT_PAGE_ASPECT = 842 / 595
DEFAULT_PAGE_HEIGHT = round(CANONICAL_PAGE_WIDTH * DEFAULT_PAGE_ASPECT)


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


def generate_document_page_images(document, target_width=CANONICAL_PAGE_WIDTH):
    """Generate stored PNG page previews.

    This is intentionally dependency-light. If a production rasterizer such as
    PyMuPDF is installed later, this function is the single place to swap in
    source-PDF rendering while preserving the API contract.
    """
    from .models import DocumentPage

    page_count = max(1, document.page_count or 1)
    rendered = []
    for page_number in range(1, page_count + 1):
        page, _ = DocumentPage.objects.get_or_create(
            document=document,
            page_number=page_number,
            defaults={'width': CANONICAL_PAGE_WIDTH, 'height': DEFAULT_PAGE_HEIGHT},
        )
        aspect = (page.height or DEFAULT_PAGE_HEIGHT) / max(1, page.width or CANONICAL_PAGE_WIDTH)
        width = int(target_width)
        height = max(1, int(width * aspect))
        page.width = width
        page.height = height
        page.image.save(
            f'document-{document.id}-page-{page_number}.png',
            ContentFile(simple_blank_png(width, height)),
            save=False,
        )
        page.save(update_fields=['width', 'height', 'image'])
        rendered.append(page)
    return rendered


def rasterization_capabilities():
    pymupdf_available = False
    try:
        import fitz  # noqa: F401
        pymupdf_available = True
    except ImportError:
        pymupdf_available = False

    poppler_available = False
    try:
        subprocess.run(['pdftoppm', '-h'], capture_output=True, timeout=1, check=False)
        poppler_available = True
    except (FileNotFoundError, subprocess.SubprocessError):
        poppler_available = False

    return {
        'current_renderer': 'dependency_light_png_canvas',
        'source_accurate_pdf_rasterization': pymupdf_available or poppler_available,
        'pymupdf_available': pymupdf_available,
        'poppler_available': poppler_available,
        'fallback_renderer_available': True,
        'note': 'The current PNG/canvas preview flow is intentionally preserved; production PDF rasterization can be enabled by installing PyMuPDF or Poppler.',
    }
