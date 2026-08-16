/**
 * The server explicitly refused a credential.
 *
 * This exists so that layers above the transport can tell "the token is dead"
 * apart from "the request did not arrive" WITHOUT knowing what an HTTP status
 * code is. That distinction is the difference between signing a user out and
 * leaving their session alone, and it is far too important to express as a
 * number that only the infrastructure layer understands.
 *
 * Thrown by an AuthRepository adapter for an explicit 401/403 and for nothing
 * else. A 5xx, a timeout, a DNS failure or a CORS rejection must surface as
 * some other error — those say nothing about whether the credential is valid.
 */
export class AuthRejectedError extends Error {
  constructor(message = 'The credential was refused.') {
    super(message);
    this.name = 'AuthRejectedError';
  }
}
