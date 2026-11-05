import { Logo } from "@/components/brand/logo";

/** The narrow signed-out layout: logo, title, short description, then a bordered card. */
export function AuthCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[25rem] py-4 sm:py-10">
      <Logo className="mb-8" />
      <h1 className="text-[30px] font-extrabold leading-[1.08] tracking-[-0.02em]">{title}</h1>
      <p className="text-muted-foreground mt-2 text-[15px] leading-6">{description}</p>
      <div className="bg-card text-card-foreground mt-6 rounded-[6px] border p-5 sm:p-6">
        {children}
      </div>
    </div>
  );
}
