from playwright.sync_api import sync_playwright, expect
import time
import re

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Wait for the dev server to be ready
        max_retries = 15
        for i in range(max_retries):
            try:
                page.goto("http://localhost:3000/mobile")
                break
            except Exception:
                if i == max_retries - 1:
                    print("Could not connect to dev server")
                    raise
                time.sleep(5)

        # Verify the landing page
        expect(page.get_by_role("heading", name=re.compile(r"Tracklist for Mobile", re.I))).to_be_visible()
        page.screenshot(path="verification/mobile_landing.png")

        # Also verify home page (dark theme)
        page.goto("http://localhost:3000")
        page.screenshot(path="verification/home_web.png")

        browser.close()

if __name__ == "__main__":
    run()
