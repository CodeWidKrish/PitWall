export {};

declare global {
  interface Window {
    /** Set once the 3D car model has loaded (or failed), so other parts can react. */
    __pitwallModelReady?: boolean;
  }
}
