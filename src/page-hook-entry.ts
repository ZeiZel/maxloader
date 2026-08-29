import { installPageHook } from './page-hook';

if (typeof window !== 'undefined') installPageHook(window);
