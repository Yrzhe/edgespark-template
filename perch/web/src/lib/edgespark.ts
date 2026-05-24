/**
 * EdgeSpark client singleton for Perch dashboard auth and same-origin API calls.
 */

import { createEdgeSpark } from "@edgespark/web";
import "@edgespark/web/styles.css";

export const client = createEdgeSpark();
