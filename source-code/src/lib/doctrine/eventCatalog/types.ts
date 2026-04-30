/**
 * Shared types for the event catalog.
 *
 * Defining the VerticalVocabulary interface in a dedicated file (rather than
 * separately inside each platform-family file) keeps the contract canonical
 * and avoids structural drift if the shape evolves.
 */

export interface VerticalVocabulary {
  /** Canonical revenue/conversion event name in natural human language. */
  primaryEvent: string;
  /** Synonyms or sub-events the LLM may also reference. */
  alternativeEvents: string[];
  /** Native ad-tech KPI terms for this sub-vertical. */
  kpiTerms: string[];
  /** Vertical-native operational mechanic terms used in HOW context. */
  mechanicTerms: string[];
}
