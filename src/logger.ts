import winston from 'winston';
import path from 'path';

// Define custom log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

// Tell winston about our colors
winston.addColors(colors);

// Custom format
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}`,
  ),
);

// Create the logger instance with only console transport initially
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels,
  format,
  transports: [
    // Write to console with custom format
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
      ),
    }),
  ],
});

// Create a stream object with a write function that will be used by Morgan
const stream = {
  write: (message: string) => {
    logger.http(message.trim());
  },
};

// Function to add file transports after directory is created
export function addFileTransports(logDirectory: string) {
  logger.add(
    new winston.transports.File({
      filename: path.join(logDirectory, 'error.log'),
      level: 'error',
    })
  );
  logger.add(
    new winston.transports.File({
      filename: path.join(logDirectory, 'combined.log'),
    })
  );
}

export { logger, stream };
