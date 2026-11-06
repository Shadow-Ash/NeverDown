export class SecurePurchaseError extends Error {
  readonly code: string;
  constructor(message: string, code: string) { super(message); this.name = "SecurePurchaseError"; this.code = code; }
}
export function isecurePurchaseCompatible(): boolean { return false; }
