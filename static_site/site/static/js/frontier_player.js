(function () {
    class FrontierPlayer {
        constructor(root, options = {}) {
            this.root = root;
            this.steps = [];
            this.index = 0;
            this.speed = 1;
            this.timer = 0;
            this.onStepChange = typeof options.onStepChange === "function" ? options.onStepChange : function () {};
            this.onPlayChange = typeof options.onPlayChange === "function" ? options.onPlayChange : function () {};
            const all = (selector) => Array.from(root.querySelectorAll(selector));
            this.el = {
                prev: all("[data-frontier-prev]"),
                next: all("[data-frontier-next]"),
                play: all("[data-frontier-play]"),
                reset: all("[data-frontier-reset]"),
                speed: all("[data-frontier-speed]"),
                name: all("[data-frontier-step-name]"),
                note: all("[data-frontier-step-note]"),
                stepper: root.querySelector("[data-frontier-stepper]"),
            };
            this.bind();
        }

        bind() {
            this.el.prev.forEach((button) => button.addEventListener("click", () => this.setStep(this.index - 1)));
            this.el.next.forEach((button) => button.addEventListener("click", () => this.setStep(this.index + 1)));
            this.el.play.forEach((button) => button.addEventListener("click", () => this.togglePlay()));
            this.el.reset.forEach((button) => button.addEventListener("click", () => {
                this.stop();
                this.setStep(0);
            }));
            this.el.speed.forEach((select) => select.addEventListener("change", () => {
                this.speed = Number(select.value) || 1;
                if (this.timer) {
                    this.stop();
                    this.play();
                }
                this.renderControls();
            }));
            window.addEventListener("beforeunload", () => this.stop());
        }

        setSteps(steps) {
            this.steps = Array.isArray(steps) ? steps : [];
            this.index = Math.max(0, Math.min(this.index, this.steps.length - 1));
            this.renderStepper();
            this.renderControls();
            this.emit();
        }

        current() {
            return this.steps[this.index] || {};
        }

        setStep(index, options = {}) {
            if (!this.steps.length) return;
            if (options.stopPlayback !== false) this.stop();
            const nextIndex = Math.max(0, Math.min(Number(index) || 0, this.steps.length - 1));
            this.index = nextIndex;
            this.renderStepper();
            this.renderControls();
            this.emit();
        }

        delay() {
            return Math.max(420, Math.round(1200 / Math.max(0.5, this.speed || 1)));
        }

        play() {
            if (!this.steps.length || this.timer) return;
            if (this.index >= this.steps.length - 1) {
                this.index = 0;
                this.emit();
            }
            this.timer = window.setTimeout(() => this.advance(), this.delay());
            this.renderControls();
            this.onPlayChange(true);
        }

        advance() {
            if (this.index >= this.steps.length - 1) {
                this.stop();
                return;
            }
            this.index += 1;
            this.renderStepper();
            this.renderControls();
            this.emit();
            this.timer = window.setTimeout(() => this.advance(), this.delay());
        }

        stop() {
            if (this.timer) {
                window.clearTimeout(this.timer);
                this.timer = 0;
            }
            this.renderControls();
            this.onPlayChange(false);
        }

        togglePlay() {
            if (this.timer) {
                this.stop();
            } else {
                this.play();
            }
        }

        renderControls() {
            const atFirst = this.index <= 0;
            const atLast = !this.steps.length || this.index >= this.steps.length - 1;
            this.el.prev.forEach((button) => { button.disabled = atFirst; });
            this.el.next.forEach((button) => { button.disabled = atLast; });
            this.el.reset.forEach((button) => { button.disabled = atFirst && !this.timer; });
            this.el.play.forEach((button) => {
                button.textContent = this.timer ? "暂停" : "播放";
                button.classList.toggle("is-active", Boolean(this.timer));
                button.setAttribute("aria-pressed", this.timer ? "true" : "false");
            });
            this.el.speed.forEach((select) => { select.value = String(this.speed || 1); });
            this.root.classList.toggle("is-playing", Boolean(this.timer));
        }

        renderStepper() {
            if (!this.el.stepper) return;
            this.el.stepper.innerHTML = this.steps.map((step, index) => `
                <li
                    class="${index === this.index ? "is-active" : ""} ${index < this.index ? "is-complete" : ""}"
                    data-frontier-step-index="${index}"
                >
                    <span>${index + 1}</span>
                    <div><strong>${FrontierPlayer.escape(step.label)}</strong><small>${FrontierPlayer.escape(step.short || step.note || "")}</small></div>
                </li>
            `).join("");
            this.el.stepper.querySelectorAll("[data-frontier-step-index]").forEach((item) => {
                item.addEventListener("click", () => this.setStep(Number(item.dataset.frontierStepIndex)));
            });
        }

        emit() {
            const step = this.current();
            this.el.name.forEach((item) => { item.textContent = step.label || ""; });
            this.el.note.forEach((item) => { item.textContent = step.note || step.short || ""; });
            this.root.dataset.frontierStep = step.id || "";
            this.onStepChange(this.index, step);
        }

        static escape(value) {
            return String(value ?? "")
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        }
    }

    window.FrontierPlayer = FrontierPlayer;
}());
