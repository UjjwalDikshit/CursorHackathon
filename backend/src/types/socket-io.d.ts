export {};

declare module 'socket.io' {
  interface SocketData {
    userId?: string;
    role?: string;
  }
}
