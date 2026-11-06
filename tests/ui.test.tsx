// @vitest-environment jsdom
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import AuditTimeline from "@/components/audit-timeline";
import DecisionPanel, { type ReadingProgress } from "@/components/decision-panel";
import DocumentForm from "@/components/document-form";
import SummaryPanel from "@/components/summary-panel";
import { api, ApiFailure } from "@/lib/client/api";
import { clerk, mockFetch, renderWithApp, seeded } from "./helpers";

const readAll: ReadingProgress = { bodyRead: true, hasPdf: false, pdfPagesSeen: 0, pdfPages: null, pdfRead: false };

describe("API client", () => {
  it("turns error responses into ApiFailure with status and server message", async () => {
    mockFetch({ documents: { status: 409, body: { code: "CHANGED", message: "Changed elsewhere" } } });
    await expect(api("documents")).rejects.toMatchObject({ status: 409, code: "CHANGED", message: "Changed elsewhere" });
  });

  it("reports an unreachable server in plain language", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    await expect(api("documents")).rejects.toMatchObject({ status: 0, message: expect.stringMatching(/could not reach the server/) });
  });
});

describe("Decision panel", () => {
  it("keeps approve and return locked until the reading steps and confirmation are done", async () => {
    const doc = seeded("Pending Officer");
    const user = userEvent.setup();
    const { unmount } = renderWithApp(
      <DecisionPanel doc={doc} progress={{ ...readAll, bodyRead: false }} onDecided={vi.fn()} onConflict={vi.fn()} />,
    );
    const approve = screen.getByRole("button", { name: /Approve/ });
    const confirm = screen.getByRole("checkbox", { name: /I have read the full original document/ });
    expect(approve).toBeDisabled();
    expect(confirm).toBeDisabled();
    expect(screen.getByText(/Scroll to the end/)).toBeInTheDocument();

    unmount();
    renderWithApp(<DecisionPanel doc={doc} progress={readAll} onDecided={vi.fn()} onConflict={vi.fn()} />);
    const checkbox = screen.getByRole("checkbox", { name: /I have read the full original document/ });
    expect(checkbox).toBeEnabled();
    expect(screen.getByRole("button", { name: /Approve/ })).toBeDisabled();
    await user.click(checkbox);
    expect(screen.getByRole("button", { name: /Approve/ })).toBeEnabled();
  });

  it("requires a reason, then on a 409 reports the conflict and reloads instead of pretending it worked", async () => {
    const doc = seeded("Pending Officer");
    const onDecided = vi.fn();
    const onConflict = vi.fn();
    const { calls } = mockFetch({
      reject: { status: 409, body: { code: "CHANGED", message: "Someone else changed this document." } },
    });
    const user = userEvent.setup();
    const { state } = renderWithApp(<DecisionPanel doc={doc} progress={readAll} onDecided={onDecided} onConflict={onConflict} />);
    await user.click(screen.getByRole("checkbox", { name: /I have read/ }));
    await user.click(screen.getByRole("button", { name: /Return with reason/ }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Return document" }));
    expect(within(dialog).getByText(/Enter a reason/)).toBeInTheDocument();
    expect(calls).toHaveLength(0);

    await user.type(within(dialog).getByLabelText(/Reason for return/), "Costs are missing");
    await user.click(within(dialog).getByRole("button", { name: "Return document" }));
    await waitFor(() => expect(onConflict).toHaveBeenCalled());
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ version: doc.version, reason: "Costs are missing" });
    expect(state.handleError).toHaveBeenCalledWith(expect.objectContaining({ status: 409 }));
    expect(onDecided).not.toHaveBeenCalled();
  });

  it("asks for confirmation and warns that final approval locks the document", async () => {
    const doc = seeded("Pending Senior Officer");
    const onDecided = vi.fn();
    mockFetch({ approve: { body: { document: { ...doc, status: "Approved" } } } });
    const user = userEvent.setup();
    renderWithApp(<DecisionPanel doc={doc} progress={readAll} onDecided={onDecided} onConflict={vi.fn()} />);
    await user.click(screen.getByRole("checkbox", { name: /I have read/ }));
    await user.click(screen.getByRole("button", { name: /Give final approval/ }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(/locked/);
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus();
    await user.click(within(dialog).getByRole("button", { name: /Yes, give final approval/ }));
    await waitFor(() => expect(onDecided).toHaveBeenCalledWith(expect.objectContaining({ status: "Approved" }), "approve"));
  });
});

describe("AI summary panel", () => {
  const doc = seeded("Pending Officer");

  it("is labelled as AI, links each point to its source and records activity", async () => {
    mockFetch({ summarise: { body: { points: [{ paragraph: 1, section: "Purpose", text: "The office proposes a change" }], version: doc.version } } });
    const onCite = vi.fn();
    const onActivity = vi.fn();
    const user = userEvent.setup();
    renderWithApp(<SummaryPanel doc={doc} paragraphTitle={() => undefined} onCite={onCite} onActivity={onActivity} />);
    expect(screen.getByText("AI-generated")).toBeInTheDocument();
    expect(screen.getByText(/Not part of the document/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Summarise" }));
    const link = await screen.findByRole("link", { name: /Source: Purpose/ });
    expect(link).toHaveAttribute("href", "#para-1");
    await user.click(link);
    expect(onCite).toHaveBeenCalledWith(1);
    expect(onActivity).toHaveBeenCalled();
  });

  it("shows a failure with a retry, without blocking anything else", async () => {
    let attempt = 0;
    mockFetch({
      summarise: () =>
        ++attempt === 1
          ? { status: 503, body: { code: "SUMMARY_FAILED", message: "The summary service did not respond." } }
          : { body: { points: [], version: doc.version } },
    });
    const user = userEvent.setup();
    renderWithApp(<SummaryPanel doc={doc} paragraphTitle={() => undefined} onCite={vi.fn()} onActivity={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Summarise" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("did not respond");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText(/too short to summarise/)).toBeInTheDocument();
  });

  it("drops a slow response when the reader leaves the document, so it cannot land on another page", async () => {
    const { fn } = mockFetch({ summarise: { delay: 5000, body: { points: [], version: doc.version } } });
    const onActivity = vi.fn();
    const user = userEvent.setup();
    const { unmount } = renderWithApp(<SummaryPanel doc={doc} paragraphTitle={() => undefined} onCite={vi.fn()} onActivity={onActivity} />);
    await user.click(screen.getByRole("button", { name: "Summarise" }));
    expect(screen.getByRole("status")).toHaveTextContent(/Keep reading/);
    const signal = fn.mock.calls[0][1]?.signal as AbortSignal;
    unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => {});
    expect(onActivity).not.toHaveBeenCalled();
  });

  it("warns when the document changed after the summary was made", async () => {
    mockFetch({ summarise: { body: { points: [{ paragraph: 1, text: "Point" }], version: doc.version - 1 } } });
    const user = userEvent.setup();
    renderWithApp(<SummaryPanel doc={doc} paragraphTitle={() => "Purpose"} onCite={vi.fn()} onActivity={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Summarise" }));
    expect(await screen.findByText(/document changed after this summary/)).toBeInTheDocument();
  });
});

describe("Clerk document form", () => {
  it("validates inline and keeps everything typed when the PDF upload fails", async () => {
    const { calls } = mockFetch({
      documents: { status: 503, body: { code: "UPLOAD_FAILED", message: "The upload service did not respond." } },
    });
    const user = userEvent.setup();
    renderWithApp(<DocumentForm />, { user: clerk });

    await user.click(screen.getByRole("button", { name: "Submit to Officer" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/Title: Enter a title/);
    expect(screen.getByLabelText(/^Title/)).toHaveAttribute("aria-invalid", "true");
    expect(calls).toHaveLength(0);

    await user.type(screen.getByLabelText(/^Title/), "Laptops for the counter");
    await user.selectOptions(screen.getByLabelText(/Document type/), "Operations");
    await user.type(screen.getByLabelText(/Document text/), "Four laptops are needed.");
    const pdf = new File(["%PDF-1.4"], "quote.pdf", { type: "application/pdf" });
    await user.upload(screen.getByLabelText(/Supporting PDF/), pdf);
    await user.click(screen.getByRole("button", { name: "Submit to Officer" }));

    expect(await screen.findByText(/Everything you typed is still here/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Title/)).toHaveValue("Laptops for the counter");
    expect(screen.getByLabelText(/Document text/)).toHaveValue("Four laptops are needed.");
    expect(screen.getByLabelText(/Supporting PDF/)).toHaveAttribute("aria-invalid", "true");
    expect(JSON.parse(localStorage.getItem(`helpforce-draft:${clerk.id}:new`)!)).toMatchObject({ title: "Laptops for the counter" });
  });

  it("rejects non-PDF and oversized files before uploading", async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderWithApp(<DocumentForm />, { user: clerk });
    await user.upload(screen.getByLabelText(/Supporting PDF/), new File(["x"], "notes.docx", { type: "application/msword" }));
    expect(screen.getByText(/Choose a PDF file/)).toBeInTheDocument();
    // An inline error only: focus stays on the file input, no summary yet.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    const big = new File(["x"], "big.pdf", { type: "application/pdf" });
    Object.defineProperty(big, "size", { value: 11 * 1024 * 1024 });
    await user.upload(screen.getByLabelText(/Supporting PDF/), big);
    expect(screen.getByText(/10 MB or less/)).toBeInTheDocument();
  });

  it("restores unsent text after the page is left or the session expires", () => {
    localStorage.setItem(
      `helpforce-draft:${clerk.id}:new`,
      JSON.stringify({ title: "Half-written request", body: "Some text", type: "Policy", savedAt: new Date().toISOString() }),
    );
    renderWithApp(<DocumentForm />, { user: clerk });
    expect(screen.getByLabelText(/^Title/)).toHaveValue("Half-written request");
    expect(screen.getByText(/We restored the unsent text/)).toBeInTheDocument();
  });

  it("does not offer the form to approvers", () => {
    renderWithApp(<DocumentForm />);
    expect(screen.getByText(/Only Clerks can create or edit documents/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Submit/ })).not.toBeInTheDocument();
  });
});

describe("Audit history", () => {
  it("reads as plain sentences with roles, status changes and reasons, and can hide AI activity", async () => {
    const doc = seeded("Returned");
    doc.audit.push({ id: "ai", actorId: "officer-1", actor: "Sara Malik", actorRole: "officer", action: "summary requested", at: new Date().toISOString(), from: "Returned", to: "Returned" });
    const user = userEvent.setup();
    renderWithApp(<AuditTimeline doc={doc} />);
    const list = screen.getByRole("list", { name: /History/ });
    expect(list).toHaveTextContent(/\(Clerk\) submitted the document for Officer review/);
    expect(list).toHaveTextContent(/returned it to the Clerk for changes/);
    expect(list).toHaveTextContent(/Reason given:/);
    expect(list).toHaveTextContent(/Status: Pending Senior Officer.*Returned/);
    expect(list).toHaveTextContent(/asked for an AI summary/);
    await user.click(screen.getByRole("checkbox", { name: /Show AI summary activity/ }));
    expect(list).not.toHaveTextContent(/asked for an AI summary/);
  });
});

it("ApiFailure carries the HTTP status", () => {
  expect(new ApiFailure(403, "FORBIDDEN", "No").status).toBe(403);
});
