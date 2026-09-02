/**
 * Wires the settings overlay to the settings store. Every control is a plain
 * button so it stays reliable under a finger on mobile.
 */
export class SettingsPanel {
  constructor({ settings, onClose }) {
    this.settings = settings;
    this.onClose = onClose;

    this.screen = document.querySelector('#settings-screen');
    this.segmentedGroups = [...document.querySelectorAll('[data-setting-group]')];
    this.switches = [...document.querySelectorAll('[data-setting-switch]')];

    this.bindEvents();
    this.render();
    this.settings.subscribe(() => this.render());
  }

  bindEvents() {
    document
      .querySelector('#settings-close')
      .addEventListener('click', () => this.close());

    this.screen.addEventListener('click', (event) => {
      if (event.target === this.screen) this.close();
    });

    for (const group of this.segmentedGroups) {
      const key = group.dataset.settingGroup;
      group.addEventListener('click', (event) => {
        const option = event.target.closest('[data-value]');
        if (!option || !group.contains(option)) return;
        this.settings.set(key, option.dataset.value);
      });
    }

    for (const element of this.switches) {
      const key = element.dataset.settingSwitch;
      element.addEventListener('click', () => this.settings.toggle(key));
    }

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !this.screen.hidden) this.close();
    });
  }

  render() {
    for (const group of this.segmentedGroups) {
      const current = this.settings.get(group.dataset.settingGroup);
      for (const option of group.querySelectorAll('[data-value]')) {
        const selected = option.dataset.value === current;
        option.setAttribute('aria-checked', String(selected));
        option.classList.toggle('is-selected', selected);
      }
    }

    for (const element of this.switches) {
      const enabled = Boolean(this.settings.get(element.dataset.settingSwitch));
      element.setAttribute('aria-checked', String(enabled));
      element.classList.toggle('is-on', enabled);
    }
  }

  open() {
    this.screen.hidden = false;
    document.body.dataset.settings = 'open';
  }

  close() {
    this.screen.hidden = true;
    delete document.body.dataset.settings;
    this.onClose?.();
  }
}
