import { useMemo, useState } from "react";
import { Package, Pencil, Plus, Search } from "lucide-react";
import { Modal } from "@/components/Modal";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useFleet } from "@/lib/store";
import type { Product } from "@/lib/types";
import { cn } from "@/lib/utils";

const EMPTY: Omit<Product, "id"> & { id?: string } = {
  name: "",
  active: true,
};

export function ProductsPage() {
  const { products, addProduct, updateProduct } = useFleet();
  const [search, setSearch] = useState("");
  const [statusF, setStatusF] = useState("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const rows = useMemo(
    () =>
      products
        .filter((product) => {
          if (search && !product.name.toLowerCase().includes(search.toLowerCase())) return false;
          if (statusF === "active" && !product.active) return false;
          if (statusF === "inactive" && product.active) return false;
          return true;
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    [products, search, statusF],
  );

  const openNew = () => {
    setForm(EMPTY);
    setOpen(true);
  };

  const openEdit = (product: Product) => {
    setForm(product);
    setOpen(true);
  };

  const save = async () => {
    const name = form.name.trim();
    if (!name) return;

    if (form.id) {
      await updateProduct({ id: form.id, name, active: form.active });
    } else {
      await addProduct({ name, active: form.active });
    }

    setOpen(false);
    setForm(EMPTY);
  };

  return (
    <>
      <PageHeader
        title="Produtos"
        subtitle={`${rows.length} produtos cadastrados para a operação de fretes`}
        actions={
          <Button onClick={openNew} size="sm" className="h-9 gap-1.5 text-[12.5px]">
            <Plus className="size-3.5" />
            Novo produto
          </Button>
        }
      />

      <section className="premium-card mx-3 mt-4 px-4 py-4 md:mx-0 md:px-5">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="label-tiny">Filtros de cadastro</p>
            <h2 className="mt-1 text-[17px] font-extrabold text-foreground">
              Consultar produtos transportados
            </h2>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_180px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por produto..."
              className="h-10 pl-9 text-[12.5px]"
            />
          </div>
          <Select value={statusF} onValueChange={setStatusF}>
            <SelectTrigger className="h-10 text-[12.5px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="active">Ativos</SelectItem>
              <SelectItem value="inactive">Inativos</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>

      <section className="premium-card mx-3 my-4 overflow-hidden md:mx-0">
        <div className="flex flex-col gap-2 border-b border-border/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="label-tiny">Cadastro administrativo</p>
            <h2 className="mt-1 text-[17px] font-extrabold text-foreground">
              Produtos da transportadora
            </h2>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-[11px] font-bold text-primary">
            <Package className="size-3.5" />
            {rows.length} registros
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="data-table min-w-[680px]">
            <thead>
              <tr>
                <th>Produto</th>
                <th>Status</th>
                <th className="text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((product) => (
                <tr key={product.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <span className="inline-flex size-9 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary">
                        <Package className="size-4" />
                      </span>
                      <span className="font-semibold text-foreground">{product.name}</span>
                    </div>
                  </td>
                  <td>
                    <StatusPill active={product.active} />
                  </td>
                  <td className="text-right">
                    <button
                      title="Editar"
                      onClick={() => openEdit(product)}
                      className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-primary/10 hover:text-primary"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-12 text-center">
                    <div className="mx-auto flex max-w-sm flex-col items-center gap-2 text-muted-foreground">
                      <span className="inline-flex size-11 items-center justify-center rounded-full border border-border bg-surface-2">
                        <Search className="size-5" />
                      </span>
                      <span className="text-[13px] font-semibold text-foreground">
                        Nenhum produto encontrado
                      </span>
                      <span className="text-[12px]">Revise a busca ou os filtros aplicados.</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Modal
        open={open}
        onOpenChange={setOpen}
        title={form.id ? "Editar produto" : "Novo produto"}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" className="h-9" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button className="h-9" onClick={() => void save()}>
              Salvar
            </Button>
          </div>
        }
      >
        <div className="grid gap-3 text-[12.5px]">
          <div>
            <div className="label-tiny mb-1.5">Nome do produto</div>
            <Input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              className="h-9"
            />
          </div>
          <div className="flex items-center justify-between rounded-2xl border border-border/70 bg-surface/60 px-4 py-3">
            <div>
              <div className="label-tiny">Status</div>
              <div className="mt-1 text-[11.5px] text-muted-foreground">
                Produto disponível para novos fretes
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-muted-foreground">
                {form.active ? "Ativo" : "Inativo"}
              </span>
              <Switch
                checked={form.active}
                onCheckedChange={(checked) => setForm({ ...form, active: checked })}
              />
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 font-sans text-[10px] font-bold uppercase tracking-[0.12em]",
        active
          ? "border-success/20 bg-success/10 text-success"
          : "border-border bg-muted/55 text-muted-foreground",
      )}
    >
      {active ? "Ativo" : "Inativo"}
    </span>
  );
}
