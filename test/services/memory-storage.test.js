// @ts-check
import { MemoryStorage } from '../../src/services/storage/memory-storage.js';
import { runStorageContract } from './storage-contract.js';

runStorageContract('MemoryStorage', () => new MemoryStorage());
