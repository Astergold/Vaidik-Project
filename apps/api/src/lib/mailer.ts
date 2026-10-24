/**
 * Minimal mail interface. D6-I3-04 replaces ConsoleMailer with the real EmailProvider (SES/Resend)
 * behind this same interface, so auth code never changes.
 */
export interface Mail {
  to: string;
  subject: string;
  text: string;
}
export interface Mailer {
  send(mail: Mail): Promise<void>;
}

export class ConsoleMailer implements Mailer {
  constructor(
    private readonly log: (msg: string) => void = (m) => console.warn(m),
    private readonly production = process.env.NODE_ENV === "production",
  ) {}
  async send(mail: Mail): Promise<void> {
    // Reset/invite links are credentials. Never print bodies in production.
    this.log(
      this.production
        ? `[mail] suppressed (no provider configured): "${mail.subject}"`
        : `[mail] to=${mail.to} subject="${mail.subject}"\n${mail.text}`,
    );
  }
}

/** Captures mail in memory (tests). */
export class MemoryMailer implements Mailer {
  readonly sent: Mail[] = [];
  async send(mail: Mail): Promise<void> {
    this.sent.push(mail);
  }
}
