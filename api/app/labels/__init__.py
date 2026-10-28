"""Label extraction (SPEC 7, ADR-0004): a photo of the nutrition table becomes a checked draft.

The label photo is only read, never stored: it stays in memory or in a temporary directory
that is removed after the extraction.
"""
