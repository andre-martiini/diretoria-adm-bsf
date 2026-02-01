
from playwright.sync_api import sync_playwright, expect
import time

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()

    console_messages = []
    def on_console(msg):
        console_messages.append(f"{msg.type}: {msg.text}")
        # print(f"Console: {msg.type}: {msg.text}")

    page.on("console", on_console)

    url = "http://localhost:3000"
    print(f"Navigating to {url}")
    try:
        page.goto(url, timeout=30000)
    except Exception as e:
        print(f"Failed to load {url}: {e}")
        # Try 5173
        url = "http://localhost:5173"
        print(f"Navigating to {url}")
        page.goto(url, timeout=30000)

    # Wait for things to settle
    page.wait_for_timeout(5000)

    # 1. Check Favicon
    print("Checking Favicon...")
    favicon = page.locator('link[rel="icon"]')
    count = favicon.count()
    if count > 0:
        href = favicon.get_attribute("href")
        print(f"Favicon href: {href}")
        if href == "/favicon.svg":
            print("Favicon verification PASS")
        else:
            print("Favicon verification FAIL: href mismatch")
    else:
        print("Favicon verification FAIL: Link tag not found")

    # 2. Check Charts
    print("Checking Charts...")
    try:
        # Check if "Cronograma de Contratação" is visible
        heading = page.get_by_text("Cronograma de Contratação")
        if heading.is_visible():
             print("Charts section visible: PASS")
        else:
             print("Charts section NOT visible: FAIL")
    except Exception as e:
        print(f"Error checking charts: {e}")

    # Screenshot
    page.screenshot(path="/home/jules/verification/verification.png")
    print("Screenshot saved.")

    # 3. Check Console for "error" logs related to PNCP
    # We expect warnings, not errors.
    print("Checking Console Logs...")
    pncp_errors = [msg for msg in console_messages if "Erro ao consultar PNCP" in msg and "error" in msg.lower().split(':')[0]]

    if pncp_errors:
        print("FAIL: Found PNCP Error logs:")
        for e in pncp_errors: print(e)
    else:
        print("PASS: No PNCP Error logs found.")

    browser.close()

if __name__ == "__main__":
    with sync_playwright() as playwright:
        run(playwright)
