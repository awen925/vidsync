// Bridge entry for CRA: import the renderer app located at ./renderer/index.tsx
// react-scripts expects an entry at src/index.(js|ts|tsx). The real renderer lives
// in src/renderer so we import it here to satisfy CRA while keeping the electron
// main/renderer separation.

import './renderer/index';
