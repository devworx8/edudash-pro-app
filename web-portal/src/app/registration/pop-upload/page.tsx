import { Suspense } from 'react';
import PopUploadClient from './PopUploadClient';

export default function RegistrationPopUploadPage() {
  return (
    <Suspense fallback={<div />}>
      <PopUploadClient />
    </Suspense>
  );
}
