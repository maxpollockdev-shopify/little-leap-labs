class PersonalisationTextField {
  /** @param {HTMLElement} root */
  constructor(root) {
    this.root = root;
    this.input = root.querySelector('[data-personalisation-text-input]');
    this.counter = root.querySelector('[data-char-count]');

    if (!(this.input instanceof HTMLInputElement) || !(this.counter instanceof HTMLElement)) {
      return;
    }

    this.maxLength = parseInt(this.input.getAttribute('maxlength') || '0', 10);
    this.template = this.counter.getAttribute('data-template') || '';

    this.input.addEventListener('input', () => this.updateCharacterCount());
    this.updateCharacterCount();
  }

  updateCharacterCount() {
    if (!(this.input instanceof HTMLInputElement) || !(this.counter instanceof HTMLElement)) {
      return;
    }

    const currentLength = this.input.value.length;
    const maxLength = this.input.maxLength > 0 ? this.input.maxLength : this.maxLength;

    if (this.template) {
      this.counter.textContent = this.template
        .replace('[current]', currentLength.toString())
        .replace('[max]', maxLength.toString());
    }

    this.root.classList.toggle('personalisation-field--at-max', maxLength > 0 && currentLength >= maxLength);
  }
}

document.querySelectorAll('[data-personalisation-text]:not([data-text-initialized])').forEach((root) => {
  if (root instanceof HTMLElement) {
    root.dataset.textInitialized = 'true';
    new PersonalisationTextField(root);
  }
});
