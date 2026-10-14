import type { PublishedBrandContentV1 } from "@wlbp/api-contracts";
import type { Locale } from "@wlbp/i18n";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@wlbp/ui-foundation";
import { Mail, MessageCircle, Phone } from "lucide-react";
import { journeyMessage } from "../journey-copy";
import { publicChannelLinks } from "../public-channel-links";

export function ContactChannels({
  contact,
  locale,
}: {
  readonly contact: PublishedBrandContentV1["contact"];
  readonly locale: Locale;
}) {
  const links = publicChannelLinks(contact);
  const channels = [
    {
      key: "email" as const,
      title: "email" as const,
      action: "emailAction" as const,
      value: contact?.email,
      icon: Mail,
    },
    {
      key: "phone" as const,
      title: "phone" as const,
      action: "call" as const,
      value: contact?.phone,
      icon: Phone,
    },
    {
      key: "whatsapp" as const,
      title: "whatsapp" as const,
      action: "whatsappAction" as const,
      value: contact?.whatsapp,
      icon: MessageCircle,
    },
  ];
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {channels.map((channel) => {
        const href = links[channel.key];
        if (!href) return null;
        const Icon = channel.icon;
        return (
          <Card key={channel.key}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Icon aria-hidden="true" className="size-5" />
                {journeyMessage(locale, channel.title)}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <p className="break-all text-sm text-muted-foreground">
                <bdi dir="ltr">{channel.value}</bdi>
              </p>
              <Button asChild variant="outline">
                <a href={href} rel="noreferrer">
                  {journeyMessage(locale, channel.action)}
                </a>
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
