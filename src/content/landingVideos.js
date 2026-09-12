/**
 * The three explainer videos on the landing page.
 *
 * One source for both the rendered <VideoSection /> and the VideoObject
 * structured data, so a video can never be described to Google differently
 * from how it is shown — or described at all while it is still missing.
 *
 * To publish a video:
 *   1. Drop the file and its poster in `public/videos/` (see the README there
 *      for the expected names, dimensions and encoding).
 *   2. Set `src` and `poster` below to those paths.
 *   3. Optionally add `captionsSrc` pointing at a real .vtt file, and
 *      `uploadDate` (ISO) + `duration` (ISO 8601, e.g. 'PT1M45S') — both only
 *      improve the structured data.
 *
 * Until `src` is set the section renders a labelled placeholder naming the
 * file it expects, and no VideoObject is emitted. The written steps are the
 * text alternative and carry the section on their own.
 */

export const LANDING_VIDEOS = {
  booking: {
    id: 'how-patients-book',
    title: 'المريض بيحجز في 3 خطوات',
    lead:
      'ده اللي عميلك بيشوفه لما يفتح رابط حجزك. مفيش تحميل تطبيق، مفيش تسجيل حساب، ومفيش استنية لحد يرد عليه.',
    src: null,
    expectedSrc: '/videos/patient-booking.mp4',
    poster: '/videos/patient-booking-poster.jpg',
    stepsTitle: 'الخطوات زي ما هي في صفحة الحجز',
    steps: [
      {
        title: 'يختار الخدمة',
        desc: 'الخدمات اللي انت كاتبها بمدتها وسعرها. المدة هي اللي النظام بيحسب بيها المواعيد المتاحة.',
      },
      {
        title: 'يختار الموعد',
        desc: 'بيشوف الأوقات الفاضية فعلاً حسب ساعات عملك. لو كله محجوز، يسجّل في قائمة الانتظار وتبلّغه أول ما يتفرج موعد.',
      },
      {
        title: 'يكتب بياناته ويأكد',
        desc: 'اسمه ورقم واتساب وخلاص. يوصله تأكيد، ويوصلك انت إشعار فوري بصوت في النظام.',
      },
    ],
  },

  signup: {
    id: 'how-to-signup',
    title: 'حسابك جاهز في أقل من 5 دقايق',
    lead:
      'النظام بيمشّيك على 6 خطوات، كل واحدة فيها اختيارات جاهزة. في آخر خطوة يبقى معاك رابط حجز شغال تبعته لعملاءك.',
    src: null,
    expectedSrc: '/videos/clinic-signup.mp4',
    poster: '/videos/clinic-signup-poster.jpg',
    stepsTitle: 'الـ6 خطوات',
    steps: [
      {
        title: 'نوع النشاط',
        desc: 'عيادة، صالون، جيم، تعليم، ملاعب، أو خدمات تانية — النظام بيقترح خدمات جاهزة لنشاطك ويظهر الملف الطبي للعيادات بس.',
      },
      {
        title: 'معلوماتك',
        desc: 'اسم النشاط، رقم الواتساب بتاعك، والرقم اللي يظهر لعملاءك.',
      },
      {
        title: 'الفروع',
        desc: 'فرع واحد أو أكتر. كل فرع بعنوانه وساعات عمله، ولغير العيادات كام حجز متوازي يستحمل.',
      },
      {
        title: 'ساعات العمل',
        desc: 'مدة الموعد الواحد (من 15 دقيقة لساعة ونصف) وأيام وساعات الشغل — وتقدر تحدد أكتر من فترة في اليوم.',
      },
      {
        title: 'الخدمات',
        desc: 'تختار من الخدمات المقترحة أو تكتب بتاعتك، وتحدد مدة وسعر كل واحدة.',
      },
      {
        title: 'هويتك',
        desc: 'لوجو وصورة غلاف ولون أساسي ورابط حجز باسمك ورسالة ترحيب وسياسة إلغاء — كل ده بيظهر في صفحة الحجز.',
      },
    ],
    cta: { to: '/register', label: 'ابدأ حسابك دلوقتي', note: '14 يوم مجاناً · من غير بطاقة بنكية' },
  },

  tour: {
    id: 'system-tour',
    title: 'جولة سريعة في النظام',
    lead: 'اليوم الواحد في بسهولة: تشوف مواعيدك، تبعت تذكيرات بكرا، وتتابع عملاءك وفلوسك.',
    src: null,
    expectedSrc: '/videos/system-tour.mp4',
    poster: '/videos/system-tour-poster.jpg',
    stepsTitle: 'اللي هتشوفه',
    steps: [
      {
        title: 'كاليندر اليوم',
        desc: 'عرض يوم أو أسبوع أو شهر، وكل موعد بحالته: مؤكد، مكتمل، لم يحضر، ملغي.',
      },
      {
        title: 'تذكيرات بكرا',
        desc: 'قائمة بكل اللي عندهم مواعيد بكرا، والنظام يمشّيك عليهم واحد واحد بضغطة زر لكل واحد.',
      },
      {
        title: 'ملف العميل',
        desc: 'كل زياراته ومدفوعاته وخطة زياراته، وللعيادات التشخيص والروشتات والمرفقات.',
      },
      {
        title: 'التقارير',
        desc: 'معدل الحضور، وقيمة الغياب بالجنيه مقابل اللي اتوفّر بالتذكير.',
      },
    ],
  },
}

export const LANDING_VIDEO_LIST = Object.values(LANDING_VIDEOS)
