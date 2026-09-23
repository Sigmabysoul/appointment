from playwright.sync_api import sync_playwright


def main() -> None:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.goto("http://127.0.0.1:3100", wait_until="networkidle")
        assert page.get_by_role("heading", name="Dashboard").is_visible()
        assert page.get_by_text("No sources are configured.").is_visible()

        page.goto("http://127.0.0.1:3100/settings", wait_until="networkidle")
        page.get_by_label("Source name").fill("Smoke-test source")
        page.get_by_label("Google Sheets link").fill("https://docs.google.com/spreadsheets/d/smoke_test_sheet_id/edit")
        page.get_by_label("Upcoming tab").fill("Upcoming orders")
        page.get_by_label("In Transit tab").fill("On the way")
        page.get_by_role("button", name="Add source").click()
        page.get_by_text("Source added. You can now load headers and sync it.").wait_for()
        page.reload(wait_until="networkidle")
        assert page.get_by_text("Smoke-test source", exact=True).is_visible()
        assert page.get_by_text("Upcoming: Upcoming orders").is_visible()
        assert page.get_by_text("In transit: On the way").is_visible()

        page.goto("http://127.0.0.1:3100/upcoming", wait_until="networkidle")
        assert page.get_by_role("heading", name="Upcoming").is_visible()
        page.goto("http://127.0.0.1:3100/in-transit", wait_until="networkidle")
        assert page.get_by_role("heading", name="In transit").is_visible()
        browser.close()


if __name__ == "__main__":
    main()
