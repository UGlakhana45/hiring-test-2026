import * as path from 'path';
import * as dotenv from 'dotenv';

// Root repo `.env` (Firebase emulator does not load it automatically).
const rootEnv = path.resolve(__dirname, '../../.env');
dotenv.config({ path: rootEnv });
