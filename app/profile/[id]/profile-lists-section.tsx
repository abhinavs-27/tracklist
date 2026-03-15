"use client";

import { useState } from "react";
import { CreateListModal } from "@/components/create-list-modal";

type ProfileListsSectionProps = {
  triggerLabel?: string;
};

export function ProfileListsSection({
  triggerLabel = "Create new list",
}: ProfileListsSectionProps) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setShowModal(true)}
        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
      >
        {triggerLabel}
      </button>
      {showModal && (
        <CreateListModal onClose={() => setShowModal(false)} />
      )}
    </>
  );
}
