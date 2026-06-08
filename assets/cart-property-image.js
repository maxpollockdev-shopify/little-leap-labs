/**
 * Opens cart line item upload previews in a dialog instead of navigating to the file URL,
 * which Shopify serves as a download rather than an inline view.
 */
class CartPropertyImagePreview {
  #handleClick = (event) => {
    const trigger = event.target.closest('[data-cart-property-image-trigger]');
    if (trigger instanceof HTMLButtonElement) {
      const preview = trigger.closest('.cart-items__property-preview');
      const dialog = preview?.nextElementSibling;
      if (dialog instanceof HTMLDialogElement) dialog.showModal();
      return;
    }

    const closeButton = event.target.closest('[data-cart-property-image-close]');
    if (closeButton instanceof HTMLButtonElement) {
      closeButton.closest('dialog')?.close();
      return;
    }

    if (event.target instanceof HTMLDialogElement && event.target.matches('.cart-items__property-preview-dialog')) {
      event.target.close();
    }
  };

  #handleCancel = (event) => {
    if (event.target instanceof HTMLDialogElement && event.target.matches('.cart-items__property-preview-dialog')) {
      event.target.close();
    }
  };

  constructor() {
    document.addEventListener('click', this.#handleClick);
    document.addEventListener('cancel', this.#handleCancel);
  }
}

new CartPropertyImagePreview();
