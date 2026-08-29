import { createController } from './content';

if (typeof document !== 'undefined' && document.body) createController(document).start();
