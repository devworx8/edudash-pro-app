/** Pop (Proof of Payment) upload handlers for aftercare registration */
import { useState, useCallback } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { uploadPOPFile } from '@/lib/popUpload';
import { assertSupabase } from '@/lib/supabase';
import { ensureImageLibraryPermission } from '@/lib/utils/mediaLibrary';
import type { ShowAlert } from '../useAftercareRegistration.helpers';

type PendingPopSelection = {
  uri: string;
  name: string;
  webFile?: Blob;
};

export function usePopUpload(showAlert: ShowAlert) {
  const [proofOfPayment, setProofOfPayment] = useState<string | null>(null);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [pendingPop, setPendingPop] = useState<PendingPopSelection | null>(null);

  const handlePopUpload = useCallback(async () => {
    try {
      const hasPermission = await ensureImageLibraryPermission();
      if (!hasPermission) {
        showAlert({ title: 'Permission Required', message: 'Please allow access to your photos to upload proof of payment.' });
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
      });
      const asset = result.assets?.[0];
      if (result.canceled || !asset?.uri) return;
      setPendingPop({
        uri: asset.uri,
        name: asset.fileName || `aftercare_pop_${Date.now()}.jpg`,
        webFile: (asset as any).file,
      });
    } catch (error: any) {
      showAlert({ title: 'Upload Failed', message: error?.message || 'Failed to upload proof of payment. Please try again.' });
    } finally {
      setUploadingProof(false);
    }
  }, [showAlert]);

  const confirmPopUpload = useCallback(async (uri: string) => {
    if (!pendingPop) return;

    setUploadingProof(true);
    try {
      const supabase = assertSupabase();
      const { data: sessionData } = await supabase.auth.getSession();
      const authUserId = sessionData.session?.user?.id;
      if (!authUserId) throw new Error('Could not determine your account ID for upload.');

      const uploadResult = await uploadPOPFile(
        uri,
        'proof_of_payment',
        authUserId,
        'aftercare',
        pendingPop.name,
        uri === pendingPop.uri ? pendingPop.webFile : undefined
      );

      if (!uploadResult.success || !uploadResult.filePath) {
        throw new Error(uploadResult.error || 'Failed to upload proof of payment.');
      }

      const { data: urlData } = supabase
        .storage.from('proof-of-payments')
        .getPublicUrl(uploadResult.filePath);
      setProofOfPayment(urlData.publicUrl);
      showAlert({ title: 'Success', message: 'Proof of payment uploaded successfully!' });
    } catch (error: any) {
      showAlert({ title: 'Upload Failed', message: error?.message || 'Failed to upload proof of payment.' });
    } finally {
      setUploadingProof(false);
      setPendingPop(null);
    }
  }, [pendingPop, showAlert]);

  const cancelPopUpload = useCallback(() => setPendingPop(null), []);

  return {
    proofOfPayment, setProofOfPayment,
    uploadingProof, pendingPopUri: pendingPop?.uri || null,
    handlePopUpload, confirmPopUpload, cancelPopUpload,
  };
}
