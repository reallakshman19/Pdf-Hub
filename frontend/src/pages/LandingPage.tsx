import React from 'react';
import { Link } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  FileStack,
  MessageSquareText,
  WandSparkles,
} from 'lucide-react';
import { useSessionStore } from '@/core/session/store';
import { FileAdapter } from '@/adapters/file/FileAdapter';
import { PdfEditAdapter } from '@/adapters/pdf-edit/PdfEditAdapter';

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const { openDocument } = useSessionStore();

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      const pageCount = await PdfEditAdapter.countPages(bytes);
      const documentKey = await FileAdapter.hashBytes(bytes);

      openDocument({
        documentKey,
        fileName: file.name,
        bytes,
        pageCount,
        saveHandle: null,
      });
      navigate('/workspace');
    } catch {
      // Ignore file drop errors gracefully
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-blue-100 text-slate-900">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-6 py-12 md:px-10 lg:py-20">
        <section
          className="rounded-3xl border border-slate-200 bg-white/80 p-8 shadow-xl backdrop-blur md:p-12"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          <div className="grid gap-10 md:grid-cols-[1.35fr_1fr] md:items-center">
            <div className="space-y-5">
              <p className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-700">
                DocCraft Workspace
              </p>
              <h1 className="text-4xl font-black leading-tight tracking-tight text-slate-900 md:text-5xl">
                PDF workbench for review, organize, and macro actions.
              </h1>
              <p className="max-w-xl text-base leading-7 text-slate-600">
                Open documents, annotate with precision, automate repetitive
                page operations, and export clean output from one integrated
                toolchain.
              </p>
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Link
                  to="/workspace"
                  className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
                >
                  Open Workspace
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/debug"
                  className="inline-flex items-center rounded-md border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                >
                  Open Debug Console
                </Link>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-900 p-6 text-slate-100 shadow-lg">
              <div className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-300">
                Ready Capabilities
              </div>
              <ul className="space-y-3 text-sm">
                <li className="flex items-start gap-2">
                  <FileStack className="mt-0.5 h-4 w-4 text-blue-300" />
                  Merge, extract, split, rotate, duplicate, replace, blank-page.
                </li>
                <li className="flex items-start gap-2">
                  <MessageSquareText className="mt-0.5 h-4 w-4 text-blue-300" />
                  Text-oriented annotations with inspector controls.
                </li>
                <li className="flex items-start gap-2">
                  <WandSparkles className="mt-0.5 h-4 w-4 text-blue-300" />
                  Built-in macro recipes with output queue and save controls.
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <FeatureCard
            title="Annotate Fast"
            description="Use text box, highlight, underline, strikeout, line, arrow, callout, and sticky notes in one ribbon flow."
          />
          <FeatureCard
            title="Organize Pages"
            description="Run page operations from grouped tools and keep selected-page context across operations."
          />
          <FeatureCard
            title="Run Macros"
            description="Execute built-ins, inspect logs, and save generated outputs when you choose."
          />
        </section>
      </main>
    </div>
  );
};

const FeatureCard: React.FC<{ title: string; description: string }> = ({
  title,
  description,
}) => {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold text-slate-900">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
    </article>
  );
};
