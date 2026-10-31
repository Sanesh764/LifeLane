/**
 * Standardized ApiResponse Class for AmbuRoute
 * 
 * Provides:
 * - Consistent envelope: { success, statusCode, message, data, meta }
 * - Direct Express transmission helper: res.status(resObj.statusCode).json(resObj)
 * - Support for optional pagination and metadata envelopes
 * - Strict backward compatibility with existing { data: ... } frontend consumers
 */

class ApiResponse {
  /**
   * @param {number} statusCode - HTTP status code (e.g. 200, 201)
   * @param {any} data - Response payload
   * @param {string} [message="Success"] - Human-readable success message
   * @param {object|null} [meta=null] - Optional metadata (e.g. pagination, summary)
   */
  constructor(statusCode = 200, data = null, message = 'Success', meta = null) {
    this.statusCode = Number.isInteger(statusCode) ? statusCode : 200;
    this.data = data;
    this.message = message;
    this.success = this.statusCode >= 200 && this.statusCode < 400;

    if (meta && typeof meta === 'object') {
      this.meta = meta;
    }
  }

  // Common Success Factory Methods

  static ok(data = null, message = 'Operation completed successfully.', meta = null) {
    return new ApiResponse(200, data, message, meta);
  }

  static created(data = null, message = 'Resource created successfully.', meta = null) {
    return new ApiResponse(201, data, message, meta);
  }

  static accepted(data = null, message = 'Request accepted for processing.', meta = null) {
    return new ApiResponse(202, data, message, meta);
  }

  static noContent(message = 'Resource deleted successfully.') {
    return new ApiResponse(204, null, message);
  }

  /**
   * Directly sends the response through an Express response object
   * @param {import('express').Response} res
   */
  send(res) {
    if (!res || typeof res.status !== 'function') {
      throw new Error('Valid Express response object is required');
    }
    return res.status(this.statusCode).json(this.toJSON());
  }

  toJSON() {
    const payload = {
      success: this.success,
      statusCode: this.statusCode,
      message: this.message,
      data: this.data,
    };

    if (this.meta) {
      payload.meta = this.meta;
    }

    return payload;
  }
}

export { ApiResponse };
export default ApiResponse;
