import fs from 'fs';
import path from 'path';

describe('payment upload modal date controls', () => {
  const modalSource = fs.readFileSync(
    path.resolve(__dirname, '../../components/payments/PaymentUploadModal.tsx'),
    'utf8'
  );
  const parentPaymentsSource = fs.readFileSync(
    path.resolve(__dirname, '../../app/screens/parent-payments.tsx'),
    'utf8'
  );

  it('uses web-native date inputs and avoids rendering native pickers on web', () => {
    expect(modalSource).toContain('type="date"');
    expect(modalSource).toContain('type="month"');
    expect(modalSource).toContain("Platform.OS !== 'web' && showPaymentDatePicker");
    expect(modalSource).toContain("Platform.OS !== 'web' && showPaymentForField && showPaymentForPicker");
  });

  it('keeps iOS pickers open until the user taps Done', () => {
    expect(modalSource).toContain('styles.iosPickerSheet');
    expect(modalSource).toContain('styles.iosPickerActions');
    const doneButtons = modalSource.match(/iosPickerButtonText}>Done</g) ?? [];
    expect(doneButtons.length).toBeGreaterThanOrEqual(2);
  });

  it('clears the stale fee due date when opening the generic upload tab entrypoint', () => {
    expect(parentPaymentsSource).toMatch(
      /activeTab === 'upload'[\s\S]*setSelectedFeeId\(undefined\);[\s\S]*setSelectedFeeDueDate\(undefined\);[\s\S]*setShowUploadModal\(true\);/
    );
  });
});
