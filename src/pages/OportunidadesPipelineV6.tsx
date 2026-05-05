// src/pages/OportunidadesPipelineV6.tsx
import OportunidadesPipelineV5 from "./OportunidadesPipelineV5";

export default function OportunidadesPipelineV6() {
  return (
    <div className="opp-pipeline-v6">
      <style>{`
        .opp-pipeline-v6 main > section {
          display: flex !important;
          flex-direction: column !important;
        }

        .opp-pipeline-v6 main > section > div:last-child {
          margin-top: auto !important;
          padding-top: 12px !important;
        }
      `}</style>
      <OportunidadesPipelineV5 />
    </div>
  );
}
