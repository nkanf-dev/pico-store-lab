export class DeliveryError extends Error {
  constructor(code, status, details = {}) {
    super(code);
    this.name = 'DeliveryError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}
