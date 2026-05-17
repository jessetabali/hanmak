import hashlib
import io
import base64
from datetime import datetime

try:
    from pypdf import PdfReader, PdfWriter
    from reportlab.pdfgen import canvas
    from reportlab.lib.utils import ImageReader
except ImportError:  # Optional local/prod dependency for real source-PDF stamping.
    PdfReader = None
    PdfWriter = None
    canvas = None
    ImageReader = None


CANONICAL_PAGE_WIDTH = 1040
DEFAULT_PAGE_HEIGHT = 1471


def pdf_escape(value):
    return str(value).replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')


def build_pdf_text(envelope):
    lines = [
        'HanMak Signed Document',
        f'Envelope: {envelope.name}',
        f'Envelope ID: {envelope.id}',
        f'Status: {envelope.status}',
        f'Sender: {envelope.sender}',
        f'Generated UTC: {datetime.utcnow().isoformat(timespec="seconds")}Z',
        '',
        'Recipients',
    ]
    for recipient in envelope.recipients.all():
        signed_at = recipient.signed_at.isoformat() if recipient.signed_at else '-'
        lines.append(f'- {recipient.name} <{recipient.email}> | {recipient.role} | {recipient.status} | signed {signed_at}')
    lines.extend(['', 'Signatures'])
    for signature in envelope.signatures.select_related('recipient').all():
        lines.append(f'- {signature.recipient.name}: {signature.signature_type} {signature.typed_name}'.strip())
    lines.extend(['', 'Field Values'])
    for value in envelope.field_values.select_related('recipient').all():
        recipient_name = value.recipient.name if value.recipient else 'Unassigned'
        lines.append(f'- {value.field_key}: {value.value} ({recipient_name})')
    lines.extend(['', 'Document Placement Map'])
    for envelope_document in envelope.envelope_documents.select_related('document').prefetch_related('document__pages').all():
        document = envelope_document.document
        lines.append(f'- Document {envelope_document.order}: {document.title} | {document.page_count or document.pages.count()} pages | {document.sha256 or "unhashed"}')
        for page in document.pages.all()[:5]:
            fields = envelope.fields.filter(document_page=page)
            if fields:
                lines.append(f'  Page {page.page_number} ({page.width}x{page.height})')
                for field in fields:
                    value = envelope.field_values.filter(field_key=field.field_key).first()
                    field_value = value.value if value else field.value
                    lines.append(
                        f'    {field.field_type} {field.field_key or field.label}: x={field.x}, y={field.y}, w={field.width}, h={field.height}, value={field_value or "-"}'
                    )
            else:
                lines.append(f'  Page {page.page_number} ({page.width}x{page.height}) no fields')
    if not envelope.envelope_documents.exists():
        for field in envelope.fields.all()[:20]:
            value = envelope.field_values.filter(field_key=field.field_key).first()
            field_value = value.value if value else field.value
            lines.append(
                f'- Field {field.field_key or field.label}: page={field.page}, x={field.x}, y={field.y}, w={field.width}, h={field.height}, value={field_value or "-"}'
            )
    lines.extend(['', 'Audit Events'])
    for event in envelope.audit_events.select_related('actor').all()[:20]:
        actor = event.actor or 'System'
        lines.append(f'- {event.created_at.isoformat()} {event.event_type}: {event.message} ({actor})')
    return lines


def build_simple_pdf(lines):
    line_height = 14
    start_y = 760
    stream_lines = ['BT', '/F1 11 Tf', '50 760 Td']
    for index, line in enumerate(lines[:48]):
        if index:
            stream_lines.append(f'0 -{line_height} Td')
        stream_lines.append(f'({pdf_escape(line)}) Tj')
    stream_lines.append('ET')
    stream = '\n'.join(stream_lines).encode()

    objects = [
        b'<< /Type /Catalog /Pages 2 0 R >>',
        b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
        b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        b'<< /Length ' + str(len(stream)).encode() + b' >>\nstream\n' + stream + b'\nendstream',
    ]
    output = [b'%PDF-1.4\n']
    offsets = [0]
    for number, obj in enumerate(objects, start=1):
        offsets.append(sum(len(chunk) for chunk in output))
        output.append(f'{number} 0 obj\n'.encode() + obj + b'\nendobj\n')
    xref_offset = sum(len(chunk) for chunk in output)
    output.append(f'xref\n0 {len(objects) + 1}\n'.encode())
    output.append(b'0000000000 65535 f \n')
    for offset in offsets[1:]:
        output.append(f'{offset:010d} 00000 n \n'.encode())
    output.append(
        f'trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n'.encode()
    )
    return b''.join(output)


def build_signed_pdf(envelope):
    pdf_bytes = build_image_overlay_pdf(envelope) or build_stamped_source_pdf(envelope) or build_simple_pdf(build_pdf_text(envelope))
    pdf_bytes = append_attachment_pages(pdf_bytes, envelope)
    return pdf_bytes, hashlib.sha256(pdf_bytes).hexdigest()


def can_stamp_source_pdf():
    return bool(PdfReader and PdfWriter and canvas)


def field_value_record(envelope, field):
    return envelope.field_values.filter(field_key=field.field_key).first()


def field_display_value(envelope, field):
    value = field_value_record(envelope, field)
    if value and value.value:
        return value.value
    if field.value:
        return field.value
    if field.recipient:
        signature = envelope.signatures.filter(recipient=field.recipient).first()
    else:
        signature = envelope.signatures.first()
    if signature:
        image_data_url = (signature.metadata or {}).get('image_data_url')
        if image_data_url:
            return image_data_url
        return signature.typed_name or signature.signature_type
    return ''


def field_display_metadata(envelope, field):
    value = field_value_record(envelope, field)
    if value and isinstance(value.metadata, dict):
        return value.metadata
    if field.field_type in ['signature', 'initials']:
        signature = envelope.signatures.filter(recipient=field.recipient).first() if field.recipient else envelope.signatures.first()
        if signature and isinstance(signature.metadata, dict):
            return signature.metadata
    return {}


def is_data_image(value):
    return isinstance(value, str) and value.startswith('data:image/') and ';base64,' in value


def draw_data_image(c, value, x, y, width, height):
    if not ImageReader or not is_data_image(value):
        return False
    try:
        raw = value.split(';base64,', 1)[1]
        image_bytes = base64.b64decode(raw)
        c.drawImage(
            ImageReader(io.BytesIO(image_bytes)),
            x + 2,
            y + 2,
            width=max(1, width - 4),
            height=max(1, height - 4),
            preserveAspectRatio=True,
            mask='auto',
        )
        return True
    except Exception:
        return False


def field_geometry_for_page(field, page_width, page_height):
    """Map stored builder coordinates onto the PDF page image dimensions."""
    basis_width = float(getattr(field, 'page_width', None) or CANONICAL_PAGE_WIDTH)
    basis_height = float(getattr(field, 'page_height', None) or DEFAULT_PAGE_HEIGHT)
    scale_x = float(page_width or basis_width) / float(basis_width)
    scale_y = float(page_height or basis_height) / float(basis_height)
    x = float(field.x or 0) * scale_x
    width = max(1, float(field.width or 1) * scale_x)
    height = max(1, float(field.height or 1) * scale_y)
    top = float(field.y or 0) * scale_y
    y = float(page_height or basis_height) - top - height
    return x, y, width, height


def draw_field_value(c, envelope, field, page_height, page_width=CANONICAL_PAGE_WIDTH):
    display_value = field_display_value(envelope, field)
    if not display_value:
        return
    metadata = field_display_metadata(envelope, field)
    x, y, width, height = field_geometry_for_page(field, page_width, page_height)
    if draw_data_image(c, display_value, x, y, width, height):
        return
    if field.field_type == 'checkbox':
        printable = '✓' if str(display_value).lower() == 'true' else ''
    else:
        printable = 'Drawn signature' if is_data_image(display_value) else str(display_value)[:80]
    if not printable:
        return
    style = metadata.get('signature_style') if isinstance(metadata.get('signature_style'), dict) else {}
    font_size = int(style.get('size') or (max(18, min(40, height * 0.45)) if field.field_type in ['signature', 'initials'] else max(11, min(18, height * 0.34))))
    color = style.get('color') if isinstance(style, dict) else ''
    if isinstance(color, str) and len(color) == 7 and color.startswith('#'):
        try:
            c.setFillColorRGB(int(color[1:3], 16) / 255, int(color[3:5], 16) / 255, int(color[5:7], 16) / 255)
        except ValueError:
            c.setFillColorRGB(0.05, 0.13, 0.25)
    else:
        c.setFillColorRGB(0.05, 0.13, 0.25)
    family = style.get('family') if isinstance(style, dict) else ''
    if field.field_type in ['signature', 'initials']:
        bold = style.get('weight') == 'bold' if isinstance(style, dict) else False
        if family == 'serif':
            font_name = 'Times-BoldItalic' if bold else 'Times-Italic'
        elif family == 'mono':
            font_name = 'Courier-BoldOblique' if bold else 'Courier-Oblique'
        else:
            font_name = 'Helvetica-BoldOblique' if bold else 'Helvetica-Oblique'
    else:
        font_name = 'Helvetica'
    c.setFont(font_name, font_size)
    c.drawString(x + 2, y + max(8, height / 2 - 4), printable)


def build_image_overlay_pdf(envelope):
    if not canvas or not ImageReader:
        return None
    envelope_documents = list(
        envelope.envelope_documents
        .select_related('document')
        .prefetch_related('document__pages')
        .order_by('order', 'id')
    )
    if not envelope_documents:
        return None
    if not any(page.image for envelope_document in envelope_documents for page in envelope_document.document.pages.all()):
        return None
    output = io.BytesIO()
    c = None
    try:
        single_document = len(envelope_documents) == 1
        for envelope_document in envelope_documents:
            pages = list(envelope_document.document.pages.order_by('page_number'))
            for page in pages:
                page_width = int(page.width or CANONICAL_PAGE_WIDTH)
                page_height = int(page.height or DEFAULT_PAGE_HEIGHT)
                if c is None:
                    c = canvas.Canvas(output, pagesize=(page_width, page_height))
                else:
                    c.setPageSize((page_width, page_height))
                if page.image:
                    page.image.open('rb')
                    image_bytes = page.image.read()
                    page.image.close()
                    c.drawImage(
                        ImageReader(io.BytesIO(image_bytes)),
                        0,
                        0,
                        width=page_width,
                        height=page_height,
                        preserveAspectRatio=False,
                        mask='auto',
                    )
                fields = list(envelope.fields.filter(document_page=page).order_by('y', 'x', 'id'))
                if not fields and single_document:
                    fields = list(envelope.fields.filter(page=page.page_number).order_by('y', 'x', 'id'))
                for field in fields:
                    draw_field_value(c, envelope, field, page_height, page_width=page_width)
                c.showPage()
        if c is None:
            return None
        c.save()
        return output.getvalue()
    except Exception:
        return None


def build_overlay_pdf(page, fields, envelope):
    buffer = io.BytesIO()
    width = page.width or 612
    height = page.height or 792
    c = canvas.Canvas(buffer, pagesize=(width, height))
    c.setStrokeColorRGB(0.1, 0.35, 0.85)
    c.setFillColorRGB(0.05, 0.13, 0.25)
    for field in fields:
        draw_field_value(c, envelope, field, height, page_width=width)
    c.save()
    buffer.seek(0)
    return buffer


def build_stamped_source_pdf(envelope):
    if not can_stamp_source_pdf():
        return None
    envelope_document = envelope.envelope_documents.select_related('document').prefetch_related('document__pages').first()
    if not envelope_document or not envelope_document.document.file:
        return None
    try:
        source_file = envelope_document.document.file
        source_file.open('rb')
        reader = PdfReader(source_file)
        writer = PdfWriter()
        pages_by_number = {page.page_number: page for page in envelope_document.document.pages.all()}
        for index, source_page in enumerate(reader.pages, start=1):
            document_page = pages_by_number.get(index)
            fields = list(envelope.fields.filter(document_page=document_page)) if document_page else []
            if not fields:
                fields = list(envelope.fields.filter(page=index))
            if fields:
                # Always use the source PDF's actual page dimensions so field coordinates
                # from field_geometry_for_page() land in the same coordinate space that
                # pypdf uses when it merges the overlay content stream verbatim.
                media_box = source_page.mediabox
                overlay_page = type('OverlayPage', (), {
                    'width': int(float(media_box.width)),
                    'height': int(float(media_box.height)),
                })()
                overlay_reader = PdfReader(build_overlay_pdf(overlay_page, fields, envelope))
                source_page.merge_page(overlay_reader.pages[0])
            writer.add_page(source_page)
        output = io.BytesIO()
        writer.write(output)
        return output.getvalue()
    except Exception:
        return None
    finally:
        try:
            source_file.close()
        except Exception:
            pass


def attachment_field_values(envelope):
    return list(
        envelope.field_values
        .exclude(attachment='')
        .select_related('recipient', 'field')
        .order_by('created_at', 'id')
    )


def _attachment_bytes(value):
    if not value.attachment:
        return b''
    try:
        value.attachment.open('rb')
        return value.attachment.read()
    finally:
        try:
            value.attachment.close()
        except Exception:
            pass


def _attachment_filename(value):
    metadata = value.metadata if isinstance(value.metadata, dict) else {}
    return metadata.get('filename') or value.attachment.name.split('/')[-1]


def _attachment_content_type(value):
    metadata = value.metadata if isinstance(value.metadata, dict) else {}
    return metadata.get('content_type') or ''


def _attachment_cover_pdf(value, image_bytes=None):
    output = io.BytesIO()
    c = canvas.Canvas(output, pagesize=(CANONICAL_PAGE_WIDTH, DEFAULT_PAGE_HEIGHT))
    filename = _attachment_filename(value)
    content_type = _attachment_content_type(value) or 'unknown'
    recipient = value.recipient.name if value.recipient else 'Unassigned signer'
    c.setFillColorRGB(0.05, 0.13, 0.25)
    c.setFont('Helvetica-Bold', 28)
    c.drawString(72, DEFAULT_PAGE_HEIGHT - 96, 'Signer Attachment')
    c.setFont('Helvetica', 15)
    c.drawString(72, DEFAULT_PAGE_HEIGHT - 134, f'File: {filename}')
    c.drawString(72, DEFAULT_PAGE_HEIGHT - 160, f'Content type: {content_type}')
    c.drawString(72, DEFAULT_PAGE_HEIGHT - 186, f'Recipient: {recipient}')
    if value.field:
        c.drawString(72, DEFAULT_PAGE_HEIGHT - 212, f'Field: {value.field.label or value.field.field_key}')
    if image_bytes and ImageReader:
        try:
            c.drawImage(
                ImageReader(io.BytesIO(image_bytes)),
                72,
                96,
                width=CANONICAL_PAGE_WIDTH - 144,
                height=DEFAULT_PAGE_HEIGHT - 360,
                preserveAspectRatio=True,
                mask='auto',
            )
        except Exception:
            c.setFont('Helvetica-Oblique', 13)
            c.drawString(72, DEFAULT_PAGE_HEIGHT - 252, 'Image preview could not be rendered; attachment metadata is preserved above.')
    else:
        c.setFont('Helvetica-Oblique', 13)
        c.drawString(72, DEFAULT_PAGE_HEIGHT - 252, 'Attachment metadata is preserved here; binary file remains stored with the evidence bundle.')
    c.save()
    return output.getvalue()


def _add_pdf_bytes(writer, pdf_bytes):
    reader = PdfReader(io.BytesIO(pdf_bytes))
    for page in reader.pages:
        writer.add_page(page)


def append_attachment_pages(pdf_bytes, envelope):
    if not pdf_bytes or not PdfReader or not PdfWriter or not canvas:
        return pdf_bytes
    values = attachment_field_values(envelope)
    if not values:
        return pdf_bytes
    try:
        writer = PdfWriter()
        _add_pdf_bytes(writer, pdf_bytes)
        for value in values:
            data = _attachment_bytes(value)
            content_type = _attachment_content_type(value).lower()
            filename = _attachment_filename(value).lower()
            is_image = content_type.startswith('image/') or filename.endswith(('.png', '.jpg', '.jpeg'))
            _add_pdf_bytes(writer, _attachment_cover_pdf(value, image_bytes=data if is_image else None))
            if content_type == 'application/pdf' or filename.endswith('.pdf'):
                try:
                    _add_pdf_bytes(writer, data)
                except Exception:
                    pass
        output = io.BytesIO()
        writer.write(output)
        return output.getvalue()
    except Exception:
        return pdf_bytes
