// Export service for financial data: CSV, PDF, Excel
// Uses react-native-fs for file operations; ExcelJS is lazy-loaded to avoid
// promise recursion with Supabase auth during Metro/server lifecycle.

import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import { Alert } from 'react-native';
import { Buffer } from 'buffer';

import type { TransactionRecord } from './MockFinancialDataService';

export type ExportFormat = 'csv' | 'pdf' | 'excel';

export interface ExportOptions {
  format: ExportFormat;
  dateRange: {
    from: string;
    to: string;
  };
  includeCharts: boolean;
}

class ExportServiceImpl {
  private formatCurrency(amount: number): string {
    return `R${amount.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
  }

  private formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-ZA');
  }

  // CSV Export
  async exportToCSV(transactions: TransactionRecord[], filename: string): Promise<void> {
    try {
      const headers = 'Date,Type,Category,Amount,Description,Status\n';
      const rows = transactions
        .map(t => 
          `"${this.formatDate(t.date)}","${t.type}","${t.category}","${this.formatCurrency(t.amount)}","${t.description}","${t.status}"`
        )
        .join('\n');
      
      const csvContent = headers + rows;
      const filePath = `${FileSystem.documentDirectory}${filename}.csv`;
      
      await FileSystem.writeAsStringAsync(filePath, csvContent);
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(filePath, {
          mimeType: 'text/csv',
          dialogTitle: `Export ${filename}.csv`,
        });
      } else {
        Alert.alert('Success', `Financial data saved to ${filename}.csv`);
      }
    } catch (error) {
      console.error('CSV Export failed:', error);
      Alert.alert('Export Error', 'Failed to export CSV file');
    }
  }

  // Excel Export (ExcelJS loaded only when this runs to avoid promise recursion with Supabase)
  async exportToExcel(
    transactions: TransactionRecord[],
    summary: { revenue: number; expenses: number; cashFlow: number },
    filename: string
  ): Promise<void> {
    try {
      const ExcelJS = (await import('exceljs')).default;
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'EduDash Pro';
      workbook.lastModifiedBy = 'EduDash Pro';
      workbook.created = new Date();
      workbook.modified = new Date();

      // Summary sheet
      const summarySheet = workbook.addWorksheet('Summary');
      summarySheet.addRows([
        ['Financial Summary', ''],
        ['Total Revenue', this.formatCurrency(summary.revenue)],
        ['Total Expenses', this.formatCurrency(summary.expenses)],
        ['Net Cash Flow', this.formatCurrency(summary.cashFlow)],
        ['', ''],
        ['Generated on', new Date().toLocaleDateString('en-ZA')],
      ]);

      // Transactions sheet
      const transactionSheet = workbook.addWorksheet('Transactions');
      transactionSheet.addRow(['Date', 'Type', 'Category', 'Amount', 'Description', 'Status']);

      transactions.forEach(t => {
        transactionSheet.addRow([
          this.formatDate(t.date),
          t.type,
          t.category,
          t.amount,
          t.description,
          t.status,
        ]);
      });

      const filePath = `${FileSystem.documentDirectory}${filename}.xlsx`;
      const excelBuffer = await Promise.resolve(workbook.xlsx.writeBuffer());
      const bytes = excelBuffer instanceof ArrayBuffer
        ? new Uint8Array(excelBuffer)
        : excelBuffer;
      const base64 = Buffer.from(bytes).toString('base64');
      
      await FileSystem.writeAsStringAsync(filePath, base64, {
        encoding: 'base64',
      });
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(filePath, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: `Export ${filename}.xlsx`,
        });
      } else {
        Alert.alert('Success', `Financial data saved to ${filename}.xlsx`);
      }
    } catch (error) {
      console.error('Excel Export failed:', error);
      Alert.alert('Export Error', 'Failed to export Excel file');
    }
  }

  // PDF Export
  async exportToPDF(
    transactions: TransactionRecord[], 
    summary: { revenue: number; expenses: number; cashFlow: number },
    filename: string
  ): Promise<void> {
    try {
      const transactionRows = transactions
        .slice(0, 50) // Limit for PDF readability
        .map(t => `
          <tr>
            <td>${this.formatDate(t.date)}</td>
            <td style="color: ${t.type === 'income' ? '#059669' : '#DC2626'}">${t.type}</td>
            <td>${t.category}</td>
            <td>${this.formatCurrency(t.amount)}</td>
            <td>${t.description}</td>
          </tr>
        `)
        .join('');

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Financial Report</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .header { text-align: center; margin-bottom: 30px; }
            .summary { background: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 30px; }
            .summary-item { display: inline-block; margin-right: 30px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
            .positive { color: #059669; }
            .negative { color: #DC2626; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Financial Report</h1>
            <p>Generated on ${new Date().toLocaleDateString('en-ZA')}</p>
          </div>
          
          <div class="summary">
            <h2>Summary</h2>
            <div class="summary-item">
              <strong>Total Revenue:</strong> <span class="positive">${this.formatCurrency(summary.revenue)}</span>
            </div>
            <div class="summary-item">
              <strong>Total Expenses:</strong> <span class="negative">${this.formatCurrency(summary.expenses)}</span>
            </div>
            <div class="summary-item">
              <strong>Net Cash Flow:</strong> 
              <span class="${summary.cashFlow >= 0 ? 'positive' : 'negative'}">
                ${this.formatCurrency(summary.cashFlow)}
              </span>
            </div>
          </div>
          
          <h2>Transactions (Last 50)</h2>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              ${transactionRows}
            </tbody>
          </table>
        </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({
        html: htmlContent,
        base64: false,
      });
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `Export ${filename}.pdf`,
        });
      } else {
        Alert.alert('Success', `Financial report saved to ${filename}.pdf`);
      }
    } catch (error) {
      console.error('PDF Export failed:', error);
      Alert.alert('Export Error', 'Failed to export PDF file');
    }
  }

  /**
   * Export payments for a billing month as CSV for bank reconciliation.
   * Columns: Date, Amount, Reference, Student, Category, Status
   */
  async exportPaymentsForBankReconciliation(
    rows: Array<{
      date: string;
      amount: number;
      reference: string;
      student: string;
      parent: string;
      category: string;
      status: string;
    }>,
    monthLabel: string,
    filename?: string,
  ): Promise<void> {
    try {
      const baseFilename = filename || `bank-reconciliation-${monthLabel.replace(/\s+/g, '-')}`;
      const headers = 'Date,Amount (R),Reference,Student,Parent,Category,Status\n';
      const csvRows = rows
        .map((r) => {
          const dateFormatted = this.formatDate(r.date);
          const amountStr = this.formatCurrency(r.amount).replace('R', '').trim();
          const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
          return [dateFormatted, amountStr, esc(r.reference), esc(r.student), esc(r.parent), esc(r.category), esc(r.status)].join(',');
        })
        .join('\n');
      const csvContent = headers + csvRows;
      const filePath = `${FileSystem.documentDirectory}${baseFilename}.csv`;

      await FileSystem.writeAsStringAsync(filePath, csvContent);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(filePath, {
          mimeType: 'text/csv',
          dialogTitle: `Export ${baseFilename}.csv`,
        });
      } else {
        Alert.alert('Success', `Bank reconciliation export saved.`);
      }
    } catch (error) {
      console.error('Bank reconciliation export failed:', error);
      Alert.alert('Export Error', 'Failed to export payments for bank reconciliation');
    }
  }

  // Main export method
  async exportFinancialData(
    transactions: TransactionRecord[],
    summary: { revenue: number; expenses: number; cashFlow: number },
    options: ExportOptions
  ): Promise<void> {
    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `financial-report-${timestamp}`;

    switch (options.format) {
      case 'csv':
        await this.exportToCSV(transactions, filename);
        break;
      case 'excel':
        await this.exportToExcel(transactions, summary, filename);
        break;
      case 'pdf':
        await this.exportToPDF(transactions, summary, filename);
        break;
      default:
        Alert.alert('Error', 'Unsupported export format');
    }
  }
}

export const ExportService = new ExportServiceImpl();
