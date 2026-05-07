from playwright.sync_api import sync_playwright

def run_cuj(page):
    # Navigate to the workspace with the default document
    page.goto("http://localhost:5173/workspace")
    page.wait_for_timeout(2000)

    # Click on the "Review" tab to see all the new tools
    # We might just use the SVG or something
    page.locator('text=Review').first.click()
    page.wait_for_timeout(1000)

    # Try dropping a sticky note
    page.locator('button[title="Sticky Note"]').click()
    page.wait_for_timeout(500)

    # Click somewhere on the canvas
    canvas = page.locator('div[data-testid="page-surface-1"]').first
    if canvas.is_visible():
        canvas.click(position={"x": 100, "y": 100})
        page.wait_for_timeout(1000)

    # Take a screenshot of the tools
    page.screenshot(path="/home/jules/verification/screenshots/verification.png")
    page.wait_for_timeout(1000)

if __name__ == "__main__":
    import os
    os.makedirs("/home/jules/verification/videos", exist_ok=True)
    os.makedirs("/home/jules/verification/screenshots", exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            record_video_dir="/home/jules/verification/videos",
            viewport={"width": 1280, "height": 800}
        )
        page = context.new_page()
        try:
            run_cuj(page)
        except Exception as e:
            print("Failed:", e)
            page.screenshot(path="/home/jules/verification/screenshots/error.png")
        finally:
            context.close()
            browser.close()
