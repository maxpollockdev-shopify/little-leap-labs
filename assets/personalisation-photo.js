const EDIT_DIMENSIONS = {
  headshot: { width: 800, height: 800 },
  landscape: { width: 1200, height: 600 },
};

const EXPORT_DIMENSIONS = {
  headshot: { width: 1600, height: 1600 },
  landscape: { width: 2400, height: 1200 },
};

const EXPORT_QUALITY = {
  headshot: 0.95,
  landscape: 0.97,
};

/** @type {Map<string, PersonalisationPhotoField[]>} */
const fieldsByFormId = new Map();

/**
 * Exports pending personalisation photos associated with a product form.
 * @param {string} formId
 * @returns {Promise<void>}
 */
export function preparePersonalisationPhotosForForm(formId) {
  const fields = fieldsByFormId.get(formId) ?? [];
  return Promise.all(fields.map((field) => field.ensureExported())).then(() => undefined);
}

if (typeof window !== 'undefined') {
  window.preparePersonalisationPhotosForForm = preparePersonalisationPhotosForForm;
}

class PersonalisationPhotoField {
  /** @param {HTMLElement} root */
  constructor(root) {
    this.root = root;
    this.previewMode = root.dataset.previewMode === 'landscape' ? 'landscape' : 'headshot';
    this.fileInput = root.querySelector('[data-photo-input]');
    this.previewImage = root.querySelector('[data-photo-preview-image]');
    this.previewPlaceholder = root.querySelector('[data-photo-preview-placeholder]');
    this.canvas = root.querySelector('[data-photo-canvas]');
    this.editButton = root.querySelector('[data-photo-edit]');
    this.actions = root.querySelector('[data-photo-actions]');
    this.zoomControls = root.querySelector('[data-photo-zoom-controls]');
    this.cropHint = root.querySelector('[data-photo-crop-hint]');
    this.cropActions = root.querySelector('[data-photo-crop-actions]');
    this.zoomInput = root.querySelector('[data-photo-zoom]');
    this.saveButton = root.querySelector('[data-photo-save]');
    this.cancelButton = root.querySelector('[data-photo-cancel]');

    if (!(this.fileInput instanceof HTMLInputElement) || !(this.canvas instanceof HTMLCanvasElement)) {
      return;
    }

    this.ctx = this.canvas.getContext('2d');
    if (this.ctx) {
      this.ctx.imageSmoothingEnabled = true;
      this.ctx.imageSmoothingQuality = 'high';
    }
    this.image = null;
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.previewObjectUrl = null;
    this.currentFileName = 'photo.jpg';
    this.needsExport = false;
    this.hasExportedCrop = false;
    this.#formId = this.fileInput.getAttribute('form');

    if (this.#formId) {
      const fields = fieldsByFormId.get(this.#formId) ?? [];
      fields.push(this);
      fieldsByFormId.set(this.#formId, fields);
    }

    this.bindEvents();
    this.setUiState('empty');
  }

  /** @type {string | null} */
  #formId = null;

  bindEvents() {
    this.fileInput.addEventListener('change', () => this.handleFileSelect());
    this.editButton?.addEventListener('click', () => this.startEditing());
    this.saveButton?.addEventListener('click', () => this.saveCrop());
    this.cancelButton?.addEventListener('click', () => this.cancelEditing());
    this.zoomInput?.addEventListener('input', () => this.handleZoom());

    this.canvas.addEventListener('mousedown', (event) => this.startDrag(event));
    this.canvas.addEventListener('mousemove', (event) => this.drag(event));
    this.canvas.addEventListener('mouseup', () => this.endDrag());
    this.canvas.addEventListener('mouseleave', () => this.endDrag());
    this.canvas.addEventListener('touchstart', (event) => this.startDrag(event), { passive: false });
    this.canvas.addEventListener('touchmove', (event) => this.drag(event), { passive: false });
    this.canvas.addEventListener('touchend', () => this.endDrag());
  }

  /** @param {'empty' | 'preview' | 'editing'} state */
  setUiState(state) {
    const hasImage = state !== 'empty';
    const isEditing = state === 'editing';

    this.root.classList.toggle('personalisation-field--photo-has-image', hasImage);
    this.root.classList.toggle('personalisation-field--photo-editing', isEditing);

    if (this.actions instanceof HTMLElement) {
      this.actions.hidden = isEditing;
    }

    if (this.editButton instanceof HTMLButtonElement) {
      this.editButton.hidden = !hasImage || isEditing;
    }

    if (this.zoomControls instanceof HTMLElement) {
      this.zoomControls.hidden = !isEditing;
    }

    if (this.cropHint instanceof HTMLElement) {
      this.cropHint.hidden = !isEditing;
    }

    if (this.cropActions instanceof HTMLElement) {
      this.cropActions.hidden = !isEditing;
    }

    if (this.canvas instanceof HTMLCanvasElement) {
      this.canvas.hidden = !isEditing;
    }

    if (this.previewImage instanceof HTMLImageElement) {
      this.previewImage.hidden = !hasImage || isEditing;
    }

    if (this.previewPlaceholder instanceof HTMLElement) {
      this.previewPlaceholder.hidden = hasImage;
    }
  }

  handleFileSelect() {
    const file = this.fileInput.files?.[0];

    if (!file) {
      this.clearPhoto();
      return;
    }

    this.currentFileName = file.name;
    this.loadImageFromFile(file).then(() => {
      this.needsExport = true;
      this.hasExportedCrop = false;
      this.updatePreviewFromFile(file);
      this.setUiState('preview');
    });
  }

  /** @param {File} file */
  updatePreviewFromFile(file) {
    if (!(this.previewImage instanceof HTMLImageElement)) return;

    if (this.previewObjectUrl) {
      URL.revokeObjectURL(this.previewObjectUrl);
    }

    this.previewObjectUrl = URL.createObjectURL(file);
    this.previewImage.src = this.previewObjectUrl;
    this.previewImage.alt = this.currentFileName;
    this.previewImage.hidden = false;

    if (this.previewPlaceholder instanceof HTMLElement) {
      this.previewPlaceholder.hidden = true;
    }
  }

  clearPhoto() {
    this.image = null;
    this.endDrag();

    if (this.previewObjectUrl) {
      URL.revokeObjectURL(this.previewObjectUrl);
      this.previewObjectUrl = null;
    }

    if (this.previewImage instanceof HTMLImageElement) {
      this.previewImage.removeAttribute('src');
      this.previewImage.hidden = true;
    }

    if (this.previewPlaceholder instanceof HTMLElement) {
      this.previewPlaceholder.hidden = false;
    }

    this.needsExport = false;
    this.hasExportedCrop = false;
    this.setUiState('empty');
  }

  /** @param {File} file */
  loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          this.image = img;
          this.resetTransform();
          resolve();
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  resetTransform() {
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    if (this.zoomInput instanceof HTMLInputElement) {
      this.zoomInput.value = '1';
    }
  }

  setupCanvasSize() {
    const dimensions = EDIT_DIMENSIONS[this.previewMode];
    this.canvas.width = dimensions.width;
    this.canvas.height = dimensions.height;
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {HTMLCanvasElement} canvas
   * @param {HTMLImageElement} image
   * @param {number} scale
   * @param {number} offsetX
   * @param {number} offsetY
   */
  drawImageToCanvas(ctx, canvas, image, scale, offsetX, offsetY) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff9f2';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const imageAspect = image.width / image.height;
    const canvasAspect = canvas.width / canvas.height;

    let drawWidth;
    let drawHeight;

    if (imageAspect > canvasAspect) {
      drawHeight = canvas.height * scale;
      drawWidth = drawHeight * imageAspect;
    } else {
      drawWidth = canvas.width * scale;
      drawHeight = drawWidth / imageAspect;
    }

    const x = (canvas.width - drawWidth) / 2 + offsetX;
    const y = (canvas.height - drawHeight) / 2 + offsetY;

    ctx.drawImage(image, x, y, drawWidth, drawHeight);
  }

  startEditing() {
    if (!this.image) return;

    this.setupCanvasSize();
    this.resetTransform();
    this.drawImage();
    this.setUiState('editing');
  }

  cancelEditing() {
    if (!this.image) {
      this.setUiState('empty');
      return;
    }

    this.endDrag();
    this.resetTransform();
    if (this.hasExportedCrop) {
      this.needsExport = false;
    }
    this.setUiState('preview');
  }

  handleZoom() {
    if (!(this.zoomInput instanceof HTMLInputElement)) return;
    this.scale = parseFloat(this.zoomInput.value);
    this.needsExport = true;
    this.drawImage();
  }

  drawImage() {
    if (!this.image || !this.ctx) return;
    this.drawImageToCanvas(this.ctx, this.canvas, this.image, this.scale, this.offsetX, this.offsetY);
  }

  /** @param {MouseEvent | TouchEvent} event */
  startDrag(event) {
    if (!this.image || !this.root.classList.contains('personalisation-field--photo-editing')) return;

    this.isDragging = true;
    const position = this.getEventPosition(event);
    this.dragStartX = position.x - this.offsetX;
    this.dragStartY = position.y - this.offsetY;
    this.canvas.classList.add('is-dragging');
  }

  /** @param {MouseEvent | TouchEvent} event */
  drag(event) {
    if (!this.isDragging || !this.image) return;

    event.preventDefault();
    const position = this.getEventPosition(event);
    this.offsetX = position.x - this.dragStartX;
    this.offsetY = position.y - this.dragStartY;
    this.needsExport = true;
    this.drawImage();
  }

  endDrag() {
    this.isDragging = false;
    this.canvas.classList.remove('is-dragging');
  }

  /** @param {MouseEvent | TouchEvent} event */
  getEventPosition(event) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
    const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY;

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  saveCrop() {
    if (!this.image) return;

    this.exportCrop({ updateUi: true }).catch((error) => {
      console.error(error);
    });
  }

  /**
   * Ensures the file input contains an exported crop before add to cart.
   * @returns {Promise<void>}
   */
  ensureExported() {
    if (!this.image || !this.needsExport) {
      return Promise.resolve();
    }

    return this.exportCrop({ updateUi: false }).then(() => undefined);
  }

  /**
   * @param {{ updateUi?: boolean }} [options]
   * @returns {Promise<boolean>}
   */
  exportCrop({ updateUi = false } = {}) {
    if (!this.image) {
      return Promise.resolve(false);
    }

    const editDims = EDIT_DIMENSIONS[this.previewMode];
    const exportDims = EXPORT_DIMENSIONS[this.previewMode];
    const scaleFactor = exportDims.width / editDims.width;
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = exportDims.width;
    exportCanvas.height = exportDims.height;

    const exportCtx = exportCanvas.getContext('2d');
    if (!exportCtx) {
      return Promise.reject(new Error('Unable to export personalisation photo'));
    }

    exportCtx.imageSmoothingEnabled = true;
    exportCtx.imageSmoothingQuality = 'high';

    this.drawImageToCanvas(
      exportCtx,
      exportCanvas,
      this.image,
      this.scale,
      this.offsetX * scaleFactor,
      this.offsetY * scaleFactor
    );

    const extension = this.currentFileName.split('.').pop()?.toLowerCase();
    const usePng = extension === 'png';
    const mimeType = usePng ? 'image/png' : 'image/jpeg';
    const quality = usePng ? undefined : EXPORT_QUALITY[this.previewMode];

    return new Promise((resolve, reject) => {
      exportCanvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Failed to export personalisation photo'));
            return;
          }

          const fileName = usePng
            ? this.currentFileName.replace(/\.[^.]+$/, '') + '.png'
            : this.currentFileName.replace(/\.[^.]+$/, '') + '.jpg';

          const croppedFile = new File([blob], fileName, { type: mimeType });
          const dataTransfer = new DataTransfer();
          dataTransfer.items.add(croppedFile);
          this.fileInput.files = dataTransfer.files;
          this.currentFileName = fileName;
          this.needsExport = false;
          this.hasExportedCrop = true;

          if (updateUi) {
            if (this.previewObjectUrl) {
              URL.revokeObjectURL(this.previewObjectUrl);
            }

            this.previewObjectUrl = URL.createObjectURL(blob);

            if (this.previewImage instanceof HTMLImageElement) {
              this.previewImage.src = this.previewObjectUrl;
              this.previewImage.alt = fileName;
            }

            const croppedImage = new Image();
            croppedImage.onload = () => {
              this.image = croppedImage;
              this.cancelEditing();
              resolve(true);
            };
            croppedImage.onerror = () => {
              reject(new Error('Failed to load exported personalisation photo'));
            };
            croppedImage.src = this.previewObjectUrl;
            return;
          }

          resolve(true);
        },
        mimeType,
        quality
      );
    });
  }
}

document.querySelectorAll('[data-personalisation-photo]:not([data-photo-initialized])').forEach((root) => {
  if (root instanceof HTMLElement) {
    root.dataset.photoInitialized = 'true';
    new PersonalisationPhotoField(root);
  }
});
