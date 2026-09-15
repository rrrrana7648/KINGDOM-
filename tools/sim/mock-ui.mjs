/* Headless mock of @minecraft/server-ui (forms auto-cancel in tests). */
export class ActionFormData {
  title() { return this; } body() { return this; } button() { return this; }
  async show() { return { canceled: true, selection: 0 }; }
}
export class ModalFormData {
  title() { return this; } textField() { return this; } dropdown() { return this; }
  slider() { return this; } toggle() { return this; }
  async show() { return { canceled: true, formValues: [] }; }
}
