import type { Server } from 'socket.io';

let io: Server | null = null;

export function setSocketIo(server: Server): void {
  io = server;
}

export function getSocketIo(): Server | null {
  return io;
}

export function emitToUser(
  userId: string,
  event: string,
  data: unknown,
): void {
  io?.to(`user:${userId}`).emit(event, data);
}

export function emitToPostRoom(
  postId: string,
  event: string,
  data: unknown,
): void {
  io?.to(`post:${postId}`).emit(event, data);
}

export function emitAdminAlert(event: string, data: unknown): void {
  io?.to('admin:alerts').emit(event, data);
}

export function emitFeedNewPost(postId: string): void {
  io?.emit('feed:new', {
    postId,
    at: new Date().toISOString(),
  });
}

export function emitFeedPostResolved(payload: {
  postId: string;
  summaryPreview: string;
  leaderName: string;
  at: string;
}): void {
  io?.emit('feed:resolved', payload);
}
