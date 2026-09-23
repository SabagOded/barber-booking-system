"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { AdminServiceRow } from "@/lib/adminServices";
import { saveServiceOrder } from "./actions";

const PRIMARY =
  "btn-primary flex min-h-12 w-full items-center justify-center rounded-[14px] bg-brass px-4 py-3 text-base font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY =
  "flex min-h-12 w-full items-center justify-center rounded-[14px] border border-line-strong px-4 py-3 text-sm font-semibold text-cream hover:bg-card-2 disabled:cursor-not-allowed disabled:opacity-50";

export function ServiceOrderEditor({
  services,
  onCancel,
  onSaved,
}: {
  services: AdminServiceRow[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const router = useRouter();
  const [orderedIds, setOrderedIds] = useState(() => services.map((service) => service.id));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const servicesById = useMemo(
    () => new Map(services.map((service) => [service.id, service])),
    [services],
  );
  const changed = orderedIds.some((id, index) => id !== services[index]?.id);

  function servicePosition(id: string) {
    return orderedIds.indexOf(id) + 1;
  }

  function serviceName(id: string) {
    return servicesById.get(id)?.name ?? "שירות";
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
    setError(null);
    setOrderedIds((current) => {
      const from = current.indexOf(String(active.id));
      const to = current.indexOf(String(over.id));
      return from < 0 || to < 0 ? current : arrayMove(current, from, to);
    });
  }

  function moveService(id: string, offset: -1 | 1) {
    setError(null);
    setOrderedIds((current) => {
      const from = current.indexOf(id);
      const to = from + offset;
      return from < 0 || to < 0 || to >= current.length ? current : arrayMove(current, from, to);
    });
  }

  function confirmOrder() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await saveServiceOrder(orderedIds);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        router.refresh();
        onSaved();
      } catch {
        setError("לא הצלחנו לשמור את סדר השירותים. נסו שוב.");
      }
    });
  }

  return (
    <div className="mt-5 rounded-[18px] border border-brass/45 bg-bg-2/65 px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-xl font-bold text-cream">עריכת סדר הופעת השירותים</h3>
          <p className="mt-1 text-sm leading-relaxed text-sand">
            בטלפון לחצו והחזיקו לרגע את הידית ואז גררו. במקלדת לחצו רווח והזיזו עם החצים.
          </p>
        </div>
        <span className="rounded-full border border-line-strong px-2.5 py-1 text-xs text-sand">
          {orderedIds.length}
        </span>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        accessibility={{
          screenReaderInstructions: {
            draggable:
              "כדי לבחור שירות להזזה לחצו רווח או Enter. הזיזו בעזרת החצים, אשרו שוב ברווח או Enter, או בטלו עם Escape.",
          },
          announcements: {
            onDragStart({ active }) {
              const id = String(active.id);
              return `${serviceName(id)} נבחר. מיקום ${servicePosition(id)} מתוך ${orderedIds.length}.`;
            },
            onDragOver({ active, over }) {
              if (!over) return undefined;
              return `${serviceName(String(active.id))} מעל מיקום ${servicePosition(String(over.id))}.`;
            },
            onDragEnd({ active, over }) {
              if (!over) return `${serviceName(String(active.id))} לא הוזז.`;
              return `${serviceName(String(active.id))} הועבר למיקום ${servicePosition(String(over.id))}.`;
            },
            onDragCancel({ active }) {
              return `הזזת ${serviceName(String(active.id))} בוטלה.`;
            },
          },
        }}
      >
        <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
          <ol className="mt-4 space-y-2">
            {orderedIds.map((id, index) => {
              const service = servicesById.get(id);
              return service ? (
                <SortableService
                  key={id}
                  service={service}
                  position={index + 1}
                  pending={pending}
                  canMoveUp={index > 0}
                  canMoveDown={index < orderedIds.length - 1}
                  onMoveUp={() => moveService(id, -1)}
                  onMoveDown={() => moveService(id, 1)}
                />
              ) : null;
            })}
          </ol>
        </SortableContext>
      </DndContext>

      {error ? (
        <p role="alert" className="mt-3 rounded-[12px] border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <button type="button" disabled={pending} onClick={onCancel} className={SECONDARY}>
          ביטול
        </button>
        <button
          type="button"
          disabled={pending || !changed}
          onClick={confirmOrder}
          className={PRIMARY}
        >
          {pending ? "שומר סדר..." : "אשר שינוי"}
        </button>
      </div>
    </div>
  );
}

function SortableService({
  service,
  position,
  pending,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
}: {
  service: AdminServiceRow;
  position: number;
  pending: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: service.id, disabled: pending });

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        position: "relative",
        zIndex: isDragging ? 1 : undefined,
      }}
      className={
        "flex items-center gap-3 rounded-[16px] border bg-card px-3 py-3 shadow-[0_7px_18px_rgba(0,0,0,0.14)] " +
        (isDragging ? "border-brass shadow-[0_14px_28px_rgba(0,0,0,0.3)]" : "border-line")
      }
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-line-strong text-sm font-bold text-brass-hi">
        {position}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-cream">{service.name}</span>
        <span className="mt-0.5 block text-sm text-sand">
          {service.durationMinutes} דק׳{formatPriceLabel(service.priceAgorot)}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <span className="grid gap-1">
          <button
            type="button"
            disabled={pending || !canMoveUp}
            onClick={onMoveUp}
            aria-label={`העברת ${service.name} מקום אחד למעלה`}
            className="flex size-8 items-center justify-center rounded-[9px] border border-line-strong text-sm text-sand hover:border-brass/60 hover:text-brass-hi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass/50 disabled:cursor-not-allowed disabled:opacity-35"
          >
            <span aria-hidden="true">↑</span>
          </button>
          <button
            type="button"
            disabled={pending || !canMoveDown}
            onClick={onMoveDown}
            aria-label={`העברת ${service.name} מקום אחד למטה`}
            className="flex size-8 items-center justify-center rounded-[9px] border border-line-strong text-sm text-sand hover:border-brass/60 hover:text-brass-hi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass/50 disabled:cursor-not-allowed disabled:opacity-35"
          >
            <span aria-hidden="true">↓</span>
          </button>
        </span>
        <button
          ref={setActivatorNodeRef}
          type="button"
          disabled={pending}
          {...attributes}
          {...listeners}
          aria-label={`שינוי המיקום של ${service.name}, כרגע במקום ${position}`}
          className="flex min-h-12 min-w-14 touch-none select-none items-center justify-center rounded-[12px] border border-line-strong text-xl text-sand hover:border-brass/60 hover:text-brass-hi active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass/50 disabled:opacity-50 sm:min-w-12 sm:cursor-grab"
        >
          <span aria-hidden="true">⠿</span>
        </button>
      </span>
    </li>
  );
}

function formatPriceLabel(priceAgorot: number | null): string {
  if (priceAgorot == null) {
    return " · מחיר לא הוגדר";
  }
  const shekels = Math.floor(priceAgorot / 100);
  const agorot = priceAgorot % 100;
  const price = agorot === 0 ? String(shekels) : `${shekels}.${String(agorot).padStart(2, "0")}`;
  return ` · ₪${price}`;
}
