import winston from 'winston';

// Create the logger instance
export const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
});

// Add file transports
export function addFileTransports(logsDir: string): void {
    logger.add(
        new winston.transports.File({
            filename: `${logsDir}/error.log`,
            level: 'error'
        })
    );
    logger.add(
        new winston.transports.File({
            filename: `${logsDir}/combined.log`
        })
    );
} 