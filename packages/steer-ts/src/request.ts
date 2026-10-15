interface ResponseRequest {
  asResponse(): Promise<Response>;
  withResponse(): Promise<unknown>;
}

/** Wait for guidance without assimilating the SDK promise or consuming its response body. */
export class SteeredRequest extends Promise<unknown> {
  private parsed?: Promise<unknown>;

  constructor(private readonly request: Promise<{ value: unknown }>) {
    super((resolve) => resolve(undefined));
  }

  private parse(): Promise<unknown> {
    return (this.parsed ??= this.request.then(({ value }) => value));
  }

  override then<T = unknown, U = never>(
    fulfilled?: ((value: unknown) => T | PromiseLike<T>) | null,
    rejected?: ((reason: unknown) => U | PromiseLike<U>) | null,
  ): Promise<T | U> {
    return this.parse().then(fulfilled, rejected);
  }

  override catch<T = never>(rejected?: ((reason: unknown) => T | PromiseLike<T>) | null): Promise<unknown | T> {
    return this.parse().catch(rejected);
  }

  override finally(settled?: (() => void) | null): Promise<unknown> {
    return this.parse().finally(settled);
  }

  asResponse(): Promise<Response> {
    return this.request.then(({ value }) => (value as ResponseRequest).asResponse());
  }

  withResponse(): Promise<unknown> {
    return this.request.then(({ value }) => (value as ResponseRequest).withResponse());
  }
}
