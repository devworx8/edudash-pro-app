declare module '@/lib/firebase-admin' {
  export const sendDeploymentNotification: (payload: any) => Promise<void>;
}
