import {
  readCsvFile,
  readEmails,
  readTranscripts,
  type CsvTable,
  type EmailMsg,
  type Transcript,
} from "@/lib/fixture";
import { loadRenewals, type RenewalsSource } from "@/lib/renewals";
import SourcesClient from "./SourcesClient";

// Read the raw fixture from disk — and the live Renewals sheet — on every request.
export const dynamic = "force-dynamic";

export type SourcesData = {
  crmAccounts: CsvTable;
  crmDeals: CsvTable;
  renewals: RenewalsSource;
  emails: EmailMsg[];
  transcripts: Transcript[];
};

export default async function SourcesPage() {
  const data: SourcesData = {
    crmAccounts: readCsvFile("crm_accounts.csv"),
    crmDeals: readCsvFile("crm_deals.csv"),
    renewals: await loadRenewals(),
    emails: readEmails(),
    transcripts: readTranscripts(),
  };

  return <SourcesClient data={data} />;
}
