
from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()
    try:
        print("Navigating to PCA...")
        page.goto("http://localhost:3000/pca")

        # Wait for table to load (fallback data should appear)
        print("Waiting for table row...")
        page.wait_for_selector("table tbody tr", timeout=30000)

        # Click first row
        print("Clicking first row...")
        page.click("table tbody tr:first-child")

        # Wait for details modal
        print("Waiting for details modal...")
        page.wait_for_selector("text=Dados de Planejamento do PCA", timeout=10000)

        # Check for Consultor Digital button
        print("Checking for Chat button...")
        if page.is_visible("text=Consultor Digital"):
            print("Chat button found!")
        else:
            print("Chat button NOT found.")

        # Take screenshot
        page.screenshot(path="verification/pca_details.png")
        print("Screenshot saved.")

    except Exception as e:
        print(f"Error: {e}")
        page.screenshot(path="verification/error.png")
    finally:
        browser.close()

with sync_playwright() as playwright:
    run(playwright)
