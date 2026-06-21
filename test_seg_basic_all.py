from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1400, "height": 900})
    page.on("console", lambda msg: print("CONSOLE:", msg.type, msg.text))
    page.on("pageerror", lambda err: print("PAGEERROR:", err))

    for path in ["/segmentation-basic/cluster", "/segmentation-basic/graph", "/segmentation-basic/region"]:
        page.goto(f"http://localhost:5000{path}", wait_until="networkidle", timeout=30000)
        page.wait_for_timeout(1200)
        graph_view = page.locator("[data-segb-graph-view]")
        kmeans_view = page.locator("[data-segb-kmeans-view]")
        buttons = page.locator("[data-segb-frame-strip] button").all()
        print(f"{path}: graph_visible={graph_view.is_visible()}, kmeans_hidden={kmeans_view.is_hidden()}, buttons={len(buttons)}")

    browser.close()
