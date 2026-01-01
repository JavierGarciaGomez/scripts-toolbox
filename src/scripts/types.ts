// Metacritic API Response Types

export interface GameRow {
  // general info
  title: string;
  premiereYear: number;
  genre: string;
  franchise: string;
  developer: string;
  platforms: string;
  empty1: string;
  // critic info
  criticScore: number | null;
  criticReviewCount: number | null;
  userScore: number | null;
  awards: string;
  empty2: string;
  // status info
  HLTB: string;
  status: string;
  priority: string;
  available: string;
  rating: string;
  empty3: string;
  // played info
  started: string;
  ended: string;
  elapsedTime: string;
  empty4: string;
  // consoles info
  playstation5: number;
  "nintendo-switch-2": number;
  "xbox-series-x": number;
  pc: number;
  "nintendo-switch": number;
  "xbox-one": number;
  "playstation-4": number;
  "wii-u": number;
  "3ds": number;
  "playstation-vita": number;
  empty5: string;
  // other info
  slug: string;
  mustPlay: boolean;
  Suggested: boolean;
}

// Detail API Response Types
export interface GameDetailResponse {
  id: number;
  type: string;
  typeId: number;
  title: string;
  slug: string;
  mustPlay: boolean;
  premiereYear: number;
  description: string;
  platform: string;
  criticScoreSummary: CriticScoreSummary;
  releaseDate: string;
  releaseDateText: string;
  production: Production;
  images: Image[];
  video: Video;
  genres: Genre[];
  rating: string;
  countries: string[];
  platforms: Platform[];
  gameTaxonomy: GameTaxonomy;
}

export interface CriticScoreSummary {
  url: string;
  max: number;
  score: number;
  normalizedScore: number;
  reviewCount: number;
  positiveCount: number;
  neutralCount: number;
  negativeCount: number;
  sentiment: string;
}

export interface Production {
  companies: Company[];
  officialSite: string | null;
  crew: CrewMember[];
}

export interface Company {
  id: number;
  typeId: number;
  typeName: string;
  name: string;
  url: string;
}

export interface CrewMember {
  id: number;
  name: string;
  roles: string[];
}

export interface Image {
  id: string;
  filename: string;
  dateCreated: DateInfo;
  alt: string | null;
  credits: string | null;
  path: string | null;
  cropGravity: string | null;
  crop: string | null;
  caption: string | null;
  typeName: string;
  imageUrl: string | null;
  width: number;
  height: number;
  sType: string | null;
  bucketType: string;
  bucketPath: string;
  mediaType: string | null;
  provider: string;
}

export interface DateInfo {
  date: string | null;
  timezone: string | null;
}

export interface Video {
  videoId: number;
  videoTitle: string;
  seriesTitle: string | null;
  videoDescription: string | null;
  seasonNumber: number;
  episodeNumber: number;
  originalAirDate: string | null;
  runTimeinSeconds: number;
  networkContentId: string;
  dateCreated: string;
  dateChanged: string;
  activationDate: string;
  expirationDate: string | null;
  isFull: boolean;
  releaseYear: number;
  network: Network;
  provider: Provider;
  contentType: ContentType;
  images: any | null;
  videoLinks: VideoLink[];
  externalIds: ExternalId[];
  tvguideTvoId: number;
  rating: string | null;
  genres: any | null;
  jwPlayerId: string;
}

export interface Network {
  networkId: number;
  networkName: string;
  tvgSourceId: number;
}

export interface Provider {
  providerId: number;
  providerName: string | null;
}

export interface ContentType {
  contentTypeId: number;
  contentTypeName: string;
  contentTypeGroup: ContentTypeGroup;
}

export interface ContentTypeGroup {
  contentTypeGroupId: number;
  contentTypeGroupName: string;
}

export interface VideoLink {
  deliveryMethod: DeliveryMethod;
  videoLinks: VideoLinkDetail[];
}

export interface DeliveryMethod {
  deliveryMethodId: number;
  deliveryMethodName: string;
}

export interface VideoLinkDetail {
  linkNetworkContentId: string | null;
  fileType: string | null;
  qualityType: string | null;
  purchaseType: PurchaseType;
  linkUrl: string;
  prices: any | null;
}

export interface PurchaseType {
  purchaseTypeId: number;
  purchaseTypeName: string;
}

export interface ExternalId {
  externalIdType: ExternalIdType;
  externalId: string;
}

export interface ExternalIdType {
  externalIdTypeId: number;
  externalIdTypeName: string;
}

export interface Genre {
  id: number;
  name: string;
}

export interface Platform {
  id: number;
  name: string;
  criticScoreSummary: CriticScoreSummary;
  relatedGameId: number;
  isLeadPlatform: boolean;
  releaseDate: string;
  slug: string;
}

export interface GameTaxonomy {
  franchises: Franchise[];
  family: TaxonomyItem;
  title: TaxonomyItem;
  game: TaxonomyItem;
  platform: TaxonomyItem;
}

export interface Franchise {
  id: number;
  name: string;
}

export interface TaxonomyItem {
  id: number;
  name: string;
}
