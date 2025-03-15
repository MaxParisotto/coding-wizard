import { LogLevel } from './types.js';

export class Logger {
  private static instance: Logger;
  private consoleImpl: { log: (message: string) => void; warn: (message: string) => void; error: (message: string) => void };

  private constructor(consoleImpl?: { log: (message: string) => void; warn: (message: string) => void; error: (message: string) => void }) {
    this.consoleImpl = consoleImpl || console;
  }

  public static getInstance(consoleImpl?: { log: (message: string) => void; warn: (message: string) => void; error: (message: string) => void }): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger(consoleImpl);
    }
    return Logger.instance;
  }

  public log(level: LogLevel, message: string): void {
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    switch (level) {
      case LogLevel.INFO:
        this.consoleImpl.log(formattedMessage);
        break;
      case LogLevel.WARN:
        this.consoleImpl.warn(formattedMessage);
        break;
      case LogLevel.ERROR:
        this.consoleImpl.error(formattedMessage);
        break;
      default:
        this.consoleImpl.log(formattedMessage); // Use log as the default
    }
  }

  public info(message: string): void {
    this.log(LogLevel.INFO, message);
  }

  public warn(message: string): void {
    this.log(LogLevel.WARN, message);
  }

  public error(message: string): void {
    this.log(LogLevel.ERROR, message);
  }
}
