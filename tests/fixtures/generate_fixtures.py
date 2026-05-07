import fitz

def create_simple_text():
    doc = fitz.open()
    for i in range(2):
        page = doc.new_page(width=595, height=842)
        page.insert_text((72, 72), f"Page {i+1}: Simple Text Test", fontsize=18)
        page.insert_text((72, 110), "Clean digital text for viewer and OCR testing.", fontsize=12)
        page.insert_text((72, 130), "The quick brown fox jumps over the lazy dog.", fontsize=12)
    doc.save("tests/fixtures/pdfs/simple-text.pdf")
    print(f"simple-text.pdf: {doc.page_count} pages")

def create_large_file(multiplier: int, filename: str):
    doc = fitz.open()
    for i in range(10 * multiplier):
        page = doc.new_page(width=595, height=842)
        for j in range(50):
            page.insert_text((72, 72 + (j*10)), f"This is some filler text line {j} on page {i} to bulk up the document.", fontsize=10)
    doc.save(f"tests/fixtures/pdfs/{filename}")
    print(f"{filename}: {doc.page_count} pages")

if __name__ == "__main__":
    create_simple_text()
    create_large_file(10, "1mb-sample.pdf")
    create_large_file(100, "10mb-sample.pdf")
