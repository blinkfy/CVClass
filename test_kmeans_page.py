from playwright.sync_api import sync_playwright

url = "http://localhost:5000/segmentation-basic/cluster"
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1400, "height": 900})
    page.on("console", lambda msg: print("CONSOLE:", msg.type, msg.text))
    page.on("pageerror", lambda err: print("PAGEERROR:", err))
    page.goto(url, wait_until="networkidle", timeout=30000)
    page.wait_for_timeout(1200)

    def state(label):
        graph_view = page.locator("[data-segb-graph-view]")
        kmeans_view = page.locator("[data-segb-kmeans-view]")
        buttons = page.locator("[data-segb-frame-strip] button").all()
        cur = page.locator("[data-segb-current-iter]").inner_text()
        print(f"{label}: graph={graph_view.is_visible()}, kmeans_hidden={kmeans_view.is_hidden()}, buttons={len(buttons)}, iter={cur}")
        return len(buttons)

    # Initial RGB mode
    state("RGB initial")
    page.screenshot(path="f:/projects/CVClass/test_kmeans_rgb.png", full_page=True)

    # Click play and wait
    play_btn = page.locator("[data-segb-play]")
    print("play text before:", play_btn.inner_text())
    play_btn.click()
    page.wait_for_timeout(2500)
    print("play text after:", play_btn.inner_text())
    page.screenshot(path="f:/projects/CVClass/test_kmeans_play.png", full_page=True)

    # Switch to RGB+XY
    xy_btn = page.locator("[data-segb-method='kmeans-rgbxy']")
    xy_btn.click()
    page.wait_for_timeout(1200)
    state("RGB+XY")
    page.screenshot(path="f:/projects/CVClass/test_kmeans_rgbxy.png", full_page=True)

    # Switch to compare
    compare_btn = page.locator("[data-segb-method='kmeans-compare']")
    compare_btn.click()
    page.wait_for_timeout(1200)
    n = state("Compare")
    page.screenshot(path="f:/projects/CVClass/test_kmeans_compare.png", full_page=True)

    # Click last frame in compare
    if n > 1:
        page.locator("[data-segb-frame-strip] button").nth(n - 1).click()
        page.wait_for_timeout(500)
        print("compare last iter:", page.locator("[data-segb-current-iter]").inner_text())

    browser.close()
