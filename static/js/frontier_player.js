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
            this.el = {
                prev: root.querySelector("[data-frontier-prev]"),
                next: root.querySelector("[data-frontier-next]"),
                play: root.querySelector("[data-frontier-play]"),
                reset: root.querySelector("[data-frontier-reset]"),
                speed: root.querySelector("[data-frontier-speed]"),
                name: root.querySelector("[data-frontier-step-name]"),
                note: root.querySelector("[data-frontier-step-note]"),
                stepper: root.querySelector("[data-frontier-stepper]"),
            };
            this.bind();
        }

        bind() {
            this.el.prev?.addEventListener("click", () => this.setStep(this.index - 1));
            this.el.next?.addEventListener("click", () => this.setStep(this.index + 1));
            this.el.play?.addEventListener("click", () => this.togglePlay());
            this.el.reset?.addEventListener("click", () => {
                this.stop();
                this.setStep(0);
            });
            this.el.speed?.addEventListener("change", () => {
                this.speed = Number(this.el.speed.value) || 1;
                if (this.timer) {
                    this.stop();
                    this.play();
                }
                this.renderControls();
            });
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
            if (this.el.prev) this.el.prev.disabled = atFirst;
            if (this.el.next) this.el.next.disabled = atLast;
            if (this.el.reset) this.el.reset.disabled = atFirst && !this.timer;
            if (this.el.play) {
                this.el.play.textContent = this.timer ? "暂停" : "播放";
                this.el.play.classList.toggle("is-active", Boolean(this.timer));
                this.el.play.setAttribute("aria-pressed", this.timer ? "true" : "false");
            }
            if (this.el.speed) this.el.speed.value = String(this.speed || 1);
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
            if (this.el.name) this.el.name.textContent = step.label || "";
            if (this.el.note) this.el.note.textContent = step.note || step.short || "";
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
