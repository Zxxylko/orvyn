export class SafeAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SafeAuthError';
  }
}

