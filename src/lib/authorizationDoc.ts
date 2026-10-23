import type { ImageAuthorization } from './types';
import type { Settings } from './types';

export const PURPOSE_LABELS: Record<string, string> = {
  instagram: 'Publicação no Instagram',
  facebook: 'Publicação no Facebook',
  tiktok: 'Publicação no TikTok',
  youtube: 'Publicação no YouTube',
  pinterest: 'Publicação no Pinterest',
  website_portfolio: 'Publicação em site e portfólio profissional',
  google_business: 'Divulgação em Google Business Profile e plataformas equivalentes',
  stories_reels: 'Publicação em stories, reels, vídeos e publicações patrocinadas',
  paid_ads: 'Utilização em anúncios pagos',
  printed_catalogs: 'Divulgação em catálogos e materiais impressos',
  physical_showroom: 'Exibição em mostruários físicos do estúdio',
  competitions_exhibitions: 'Participação em concursos, exposições ou publicações profissionais',
  other_purposes: 'Outras finalidades',
};

export const MATERIAL_LABELS: Record<string, string> = {
  selected_photos: 'Fotografias selecionadas',
  behind_the_scenes: 'Fotografias de bastidores',
  session_videos: 'Vídeos do ensaio',
  voice_recordings: 'Gravações de voz',
  person_name: 'Nome da pessoa fotografada',
  testimonials: 'Depoimentos',
  individual_photos: 'Fotografias individuais',
  group_photos: 'Fotografias em grupo',
  pregnant_baby_children: 'Imagens de gestantes, bebês, crianças e familiares',
  other_materials: 'Outros materiais',
};

export const EDITING_LABELS: Record<string, string> = {
  color_light_contrast: 'Ajustes de cor, luz, contraste e enquadramento',
  resize_compress: 'Redimensionamento e compressão para redes sociais',
  visual_identity: 'Aplicação da identidade visual do estúdio',
  watermark: 'Inclusão de logomarca ou marca-d\'água',
  video_editing: 'Edição de vídeo e adaptação de formato',
  format_adaptation: 'Adaptação de formato para diferentes plataformas',
};

function selectedItems(obj: Record<string, boolean>, labels: Record<string, string>): string[] {
  return Object.keys(obj).filter((k) => obj[k]).map((k) => labels[k] ?? k);
}

function formatCurrencyBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDateBR(date: string | null | undefined): string {
  if (!date) return '____/____/______';
  const d = new Date(date + 'T00:00:00');
  if (isNaN(d.getTime())) return '____/____/______';
  return d.toLocaleDateString('pt-BR');
}

export function generateAuthorizationDocument(
  auth: ImageAuthorization,
  settings: Settings
): string {
  const studioName = settings.studio_name || 'Estúdio Fotográfico';
  const studioTaxId = settings.tax_id || '____';
  const studioAddress = settings.address || '____';
  const studioPhone = settings.phone || '____';
  const studioEmail = settings.email || '____';

  const authorizerName = auth.authorizer_name || '____';
  const authorizerCpf = auth.authorizer_cpf || '____';
  const authorizerAddress = auth.authorizer_address || '____';
  const authorizerEmail = auth.authorizer_email || '____';
  const authorizerPhone = auth.authorizer_phone || '____';
  const authorizerRelationship = auth.authorizer_relationship || 'a própria pessoa fotografada';

  const photographedName = auth.photographed_name || auth.authorizer_name || '____';
  const photographedCpf = auth.photographed_cpf || '____';

  const selectedPurposes = selectedItems(auth.purposes, PURPOSE_LABELS);
  const selectedMaterials = selectedItems(auth.materials, MATERIAL_LABELS);
  const selectedEditing = selectedItems(auth.editing_permissions, EDITING_LABELS);

  const isMinor = auth.is_minor;
  const guardianName = auth.minor_legal_guardian_name || '____';
  const guardianCpf = auth.minor_legal_guardian_cpf || '____';
  const guardianRelationship = auth.minor_guardian_relationship || '____';
  const guardianDeclaration = auth.minor_guardian_declaration || '____';

  const compensationText = auth.compensation_type === 'gratuita'
    ? 'A presente autorização é GRATUITA, não havendo qualquer pagamento, remuneração ou contraprestação pela utilização autorizada. Esta gratuidade não elimina direitos legais indisponíveis da pessoa fotografada, nem transforma a presente autorização em obrigação para contratar serviços adicionais.'
    : `A presente autorização é REMUNERADA. Valor: ${formatCurrencyBRL(auth.compensation_value)}. Forma de pagamento: ${auth.compensation_payment_method || '____'}. Prazo e condições: ${auth.compensation_deadline || '____'}.`;

  const purposesList = selectedPurposes.length > 0
    ? selectedPurposes.map((p) => `    [x] ${p}`).join('\n')
    : '    Nenhuma finalidade selecionada.';
  const otherPurposes = auth.other_purposes_text ? `\n    Outras finalidades: ${auth.other_purposes_text}` : '';

  const materialsList = selectedMaterials.length > 0
    ? selectedMaterials.map((m) => `    [x] ${m}`).join('\n')
    : '    Nenhum material selecionado.';
  const otherMaterials = auth.other_materials_text ? `\n    Outros materiais: ${auth.other_materials_text}` : '';

  const editingList = selectedEditing.length > 0
    ? selectedEditing.map((e) => `    [x] ${e}`).join('\n')
    : '    Nenhum tratamento de imagem autorizado.';

  const startDate = formatDateBR(auth.start_date);
  const endDate = auth.end_date ? formatDateBR(auth.end_date) : 'por prazo indeterminado (a critério do autorizante, podendo ser revogada a qualquer tempo)';
  const territory = auth.territory || 'Território nacional e internacional (dada a natureza da internet)';
  const channels = auth.channels || 'Plataformas e canais selecionados nas finalidades acima';

  const minorClause = isMinor ? `

CLÁUSULA 10. AUTORIZAÇÃO PARA MENORES DE IDADE

10.1. A pessoa fotografada, ${photographedName}, é menor de 18 (dezoito) anos, conforme data de nascimento: ${formatDateBR(auth.photographed_birth_date)}.

10.2. Esta autorização é concedida por ${guardianName}, CPF ${guardianCpf}, na qualidade de ${guardianRelationship} do menor, que declara ser responsável legal e possuir legitimidade para conceder a presente autorização.

10.3. Declaração de responsabilidade: ${guardianDeclaration}

10.4. O estúdio declara considerar o melhor interesse da criança ou do adolescente, sua dignidade, privacidade, imagem e demais direitos protegidos pelo Estatuto da Criança e do Adolescente (Lei nº 8.069/1990) e pela legislação aplicável.

10.5. Quando pertinente, a participação e a manifestação da própria criança ou adolescente foram consideradas conforme sua idade, maturidade e situação concreta.

10.6. Para situações de guarda compartilhada, representação, conflito entre responsáveis ou dúvida sobre a legitimidade da autorização, recomenda-se análise individual e revisão jurídica antes da publicação.

10.7. Não se presume que um cliente adulto possa autorizar automaticamente a divulgação da imagem de todos os acompanhantes ou familiares que apareçam nas fotografias.` : '';

  return `TERMO DE AUTORIZAÇÃO DE USO DE IMAGEM, VOZ E NOME PARA DIVULGAÇÃO EM REDES SOCIAIS, PORTFÓLIO E MATERIAIS PUBLICITÁRIOS

Documento nº ${auth.doc_number || '____'} | Versão ${auth.version}
Status: ${auth.status}

AVISO: Este é um modelo inicial editável. Requer revisão jurídica antes da utilização como documento definitivo. A redação final deverá ser revisada por advogado com conhecimento em direito civil, direito de imagem, direitos da personalidade, proteção de dados pessoais e, quando aplicável, direitos de crianças e adolescentes.

CLÁUSULA 1. IDENTIFICAÇÃO DAS PARTES

1.1. AUTORIZADO (Estúdio/Fotógrafo):
    Nome/Razão Social: ${studioName}
    CPF/CNPJ: ${studioTaxId}
    Endereço profissional: ${studioAddress}
    Telefone: ${studioPhone}
    E-mail: ${studioEmail}

1.2. AUTORIZANTE (pessoa que concede a autorização):
    Nome completo: ${authorizerName}
    CPF: ${authorizerCpf}
    Endereço: ${authorizerAddress}
    Telefone: ${authorizerPhone}
    E-mail: ${authorizerEmail}
    Vínculo com a pessoa fotografada: ${authorizerRelationship}

1.3. PESSOA FOTOGRAFADA (quando diferente da autorizante):
    Nome completo: ${photographedName}
    CPF: ${photographedCpf}
    ${isMinor ? `Data de nascimento: ${formatDateBR(auth.photographed_birth_date)} (menor de idade)` : ''}

1.4. Identificação do ensaio:
    Cliente: ${photographedName}
    Ensaio: ${auth.session_title || '____'}
    Data do ensaio: ${formatDateBR(auth.session_date)}
    ${auth.gallery_ref ? `Galeria/Pasta: ${auth.gallery_ref}` : ''}

CLÁUSULA 2. FINALIDADE E ALCANCE DA AUTORIZAÇÃO

2.1. A pessoa autorizante autoriza, de maneira livre, informada, destacada e delimitada, a utilização das imagens${auth.purposes.voice_recordings ? ', da voz' : ''}${auth.purposes.person_name ? ' e do nome' : ''} da pessoa fotografada para as seguintes finalidades, expressamente selecionadas:

${purposesList}${otherPurposes}

2.2. As finalidades não selecionadas NÃO estão autorizadas. Não se considera que todas as opções foram automaticamente aceitas.

2.3. A autorização promocional é INDEPENDENTE do contrato de prestação de serviços fotográficos. A contratação do ensaio, o pagamento pelas fotografias ou a entrega dos arquivos não concede automaticamente autorização para publicidade.

CLÁUSULA 3. IDENTIFICAÇÃO DOS MATERIAIS AUTORIZADOS

3.1. A presente autorização abrange exclusivamente os seguintes materiais:

${materialsList}${otherMaterials}

${auth.gallery_ref ? `3.2. Materiais vinculados: ${auth.gallery_ref}` : ''}

3.3. A autorização está vinculada aos materiais identificados, evitando que uma permissão genérica seja interpretada como autorização irrestrita para qualquer conteúdo futuro.

CLÁUSULA 4. GRATUIDADE OU REMUNERAÇÃO

4.1. ${compensationText}

4.2. Não se presume que a contratação do ensaio fotográfico, o pagamento pelas fotografias ou a entrega dos arquivos conceda automaticamente autorização para publicidade.

CLÁUSULA 5. EDIÇÃO E TRATAMENTO DAS IMAGENS

5.1. Os seguintes tratamentos são permitidos:

${editingList}

5.2. Salvo autorização específica e válida, são PROIBIDAS alterações que descontextualizem a imagem, atribuam declarações inexistentes à pessoa, exponham situações íntimas ou prejudiquem sua honra, reputação, dignidade ou direitos de personalidade.

5.3. O uso deverá respeitar a finalidade autorizada, a boa-fé e a legislação aplicável.

CLÁUSULA 6. PRAZO, TERRITÓRIO E CANAIS DE DIVULGAÇÃO

6.1. Data de início da autorização: ${startDate}
6.2. Prazo de vigência: ${endDate}
6.3. Renovação: ${auth.renewable ? 'Sim, mediante acordo entre as partes.' : 'Não prevista.'}
6.4. Território de divulgação: ${territory}
6.5. Canais e plataformas autorizados: ${channels}
${auth.paid_campaign_conditions ? `6.6. Condições para campanhas pagas: ${auth.paid_campaign_conditions}` : ''}

6.7. O estúdio esclarece que publicações na internet podem ser acessadas internacionalmente e que não consegue garantir o controle sobre cópias, capturas de tela ou compartilhamentos feitos por terceiros.

6.8. Não se estabelece autorização perpétua, irrevogável ou ilimitada como padrão automático.

CLÁUSULA 7. DIREITO DE RECUSA E AUSÊNCIA DE PREJUÍZO

7.1. A pessoa autorizante pode recusar a autorização promocional sem que isso, por si só, implique perda do serviço fotográfico contratado, redução da qualidade das fotografias, penalidade ou tratamento discriminatório.

7.2. A autorização de uso promocional é independente do contrato de prestação de serviços fotográficos.

7.3. Não se condiciona a entrega das fotografias contratadas à concessão de autorização de publicidade, salvo hipótese juridicamente válida, específica e previamente revisada por profissional habilitado.

CLÁUSULA 8. PROTEÇÃO DE DADOS PESSOAIS (LGPD — Lei nº 13.709/2018)

8.1. Responsável pelo tratamento dos dados: ${auth.data_controller_name || studioName}
8.2. Finalidades do tratamento: ${auth.data_processing_purposes || 'Divulgação das imagens autorizadas nas finalidades selecionadas neste documento.'}
8.3. Dados tratados: ${auth.data_categories || 'Imagem, voz (quando autorizada), nome (quando autorizado) e dados de contato fornecidos.'}
8.4. Base legal aplicável: ${auth.legal_basis || 'Consentimento (art. 7º, inciso I, da LGPD) para divulgação de imagem.'}
8.5. Canais para exercício dos direitos do titular: ${auth.data_subject_rights_channel || `E-mail: ${studioEmail} | Telefone: ${studioPhone}`}
8.6. Prazo/critérios de retenção: ${auth.retention_criteria || 'Pelo prazo de vigência da autorização ou até sua revogação.'}
8.7. Medidas de segurança adotadas: ${auth.security_measures || 'Armazenamento em ambiente controlado, acesso restrito a pessoas autorizadas.'}
8.8. Compartilhamento: ${auth.sharing_conditions || 'Compartilhamento com plataformas de divulgação selecionadas, sujeito às políticas dessas plataformas.'}

8.9. A autorização de uso de imagem NÃO constitui consentimento genérico para todas as atividades de tratamento de dados pessoais. O consentimento para divulgação de imagem é separado das demais bases legais previstas na LGPD.

8.10. A publicação em plataformas de terceiros também está sujeita às políticas e práticas dessas plataformas.

CLÁUSULA 9. REVOGAÇÃO DA AUTORIZAÇÃO

9.1. A pessoa autorizante pode solicitar a revogação da autorização a qualquer tempo, mediante contato pelo e-mail ${auth.studio_contact_email || studioEmail} ou telefone ${auth.studio_contact_phone || studioPhone}.

9.2. Quando o tratamento estiver fundamentado no consentimento, sua revogação será tratada conforme a LGPD, respeitadas as condições legais aplicáveis.

9.3. Procedimento interno do estúdio:
    1. Registrar a solicitação de revogação;
    2. Identificar as imagens e publicações afetadas;
    3. Interromper novas utilizações que dependam da autorização revogada;
    4. Avaliar e executar a remoção das publicações controladas pelo estúdio, nos limites aplicáveis;
    5. Registrar as providências tomadas;
    6. Comunicar eventuais limitações, como cópias feitas por terceiros ou conteúdos fora do controle do estúdio.

9.4. O estúdio não promete a eliminação de todas as cópias existentes na internet, nem declara que a revogação apaga automaticamente tratamentos anteriores realizados de forma legítima.
${minorClause}

CLÁUSULA ${isMinor ? '11' : '10'}. RESPONSABILIDADE E LIMITES DE UTILIZAÇÃO

${isMinor ? '11' : '10'}.1. O estúdio utilizará os materiais dentro dos limites autorizados, respeitando os direitos de personalidade e as normas aplicáveis.

${isMinor ? '11' : '10'}.2. A autorização não transfere automaticamente a propriedade intelectual das fotografias, não substitui licenças de terceiros e não autoriza a utilização de elementos protegidos de terceiros sem a permissão necessária.

${isMinor ? '11' : '10'}.3. Quando aplicável, diferenciam-se os direitos sobre a fotografia (direito autoral do fotógrafo) dos direitos da pessoa retratada (direito de imagem).

CLÁUSULA ${isMinor ? '12' : '11'}. DECLARAÇÃO DE CIÊNCIA E MANIFESTAÇÃO DE VONTADE

${isMinor ? '12' : '11'}.1. A pessoa autorizante declara que:
    a) Leu e compreendeu o presente documento;
    b) Teve oportunidade de esclarecer dúvidas;
    c) Recebeu informações sobre as finalidades da utilização;
    d) Pôde escolher individualmente os canais e as finalidades autorizados;
    e) Está ciente de que a autorização promocional é separada da contratação do serviço;
    ${isMinor ? 'f) Declara possuir legitimidade para conceder a autorização em nome do menor.' : 'f) Declara possuir legitimidade para conceder a autorização.'}

${isMinor ? '12' : '11'}.2. A manifestação de vontade está registrada com data e identificação da versão do documento: ${auth.document_version || `v${auth.version}`}.

CLÁUSULA ${isMinor ? '13' : '12'}. ASSINATURAS

${isMinor ? '13' : '12'}.1. Local e data: ${auth.signing_city || '____'}, ${formatDateBR(auth.signing_date)}

${isMinor ? '13' : '12'}.2. Assinatura da pessoa autorizante:
    ${auth.authorizer_signature ? '[Assinatura digitalmente capturada]' : '_______________________________'}
    ${authorizerName}

${isMinor ? `13.3. Assinatura do responsável legal:
    ${auth.guardian_signature ? '[Assinatura digitalmente capturada]' : '_______________________________'}
    ${guardianName}` : ''}

${isMinor ? '13' : '12'}.4. Identificação do fotógrafo/representante do estúdio:
    ${auth.studio_representative || '_______________________________'}

${auth.witness_1_name ? `${isMinor ? '13' : '12'}.5. Testemunha 1: ${auth.witness_1_name} — CPF: ${auth.witness_1_cpf || '____'}` : ''}
${auth.witness_2_name ? `${isMinor ? '13' : '12'}.6. Testemunha 2: ${auth.witness_2_name} — CPF: ${auth.witness_2_cpf || '____'}` : ''}

${isMinor ? '13' : '12'}.7. Uma assinatura digitada, um nome inserido no documento ou uma imagem de assinatura NÃO constitui assinatura eletrônica certificada ou qualificada. Para assinatura eletrônica avançada, é necessária integração com um provedor compatível.

DISPOSIÇÕES FINAIS

Este modelo foi elaborado como instrumento claro, documentado e configurável para administrar autorizações de divulgação, respeitando os direitos das pessoas fotografadas e as exigências da legislação brasileira (Constituição Federal, Código Civil, Lei nº 13.709/2018 — LGPD, Lei nº 8.069/1990 — ECA, e demais normas pertinentes). NÃO elimina todos os riscos legais e deve ser revisado por profissional jurídico antes da utilização definitiva.

Documento gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}.`;
}

export function emptyAuthorizationForm(clientId: string): Partial<ImageAuthorization> {
  return {
    client_id: clientId,
    status: 'rascunho',
    version: 1,
    is_minor: false,
    compensation_type: 'gratuita',
    compensation_value: 0,
    renewable: false,
    awareness_declaration: false,
    purposes: {
      instagram: false, facebook: false, tiktok: false, youtube: false,
      pinterest: false, website_portfolio: false, google_business: false,
      stories_reels: false, paid_ads: false, printed_catalogs: false,
      physical_showroom: false, competitions_exhibitions: false, other_purposes: false,
    },
    materials: {
      selected_photos: false, behind_the_scenes: false, session_videos: false,
      voice_recordings: false, person_name: false, testimonials: false,
      individual_photos: false, group_photos: false, pregnant_baby_children: false,
      other_materials: false,
    },
    editing_permissions: {
      color_light_contrast: false, resize_compress: false, visual_identity: false,
      watermark: false, video_editing: false, format_adaptation: false,
    },
  };
}
